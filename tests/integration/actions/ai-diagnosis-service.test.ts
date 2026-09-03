import { describe, expect, it, vi } from 'vitest'
import type {
  AiDiagnosisView,
  AiNarrativeResult,
  DiagnosisContext,
  ExpenseCategoryAssignment,
} from '@/features/ai-diagnosis/domain'
import { createDiagnosisInputHash } from '@/features/ai-diagnosis/input-hash'
import { createAiDiagnosisService } from '@/features/ai-diagnosis/service'

const context: DiagnosisContext = {
  targetMonth: '202604',
  sourceRevision: 7,
  incomes: [{ month: '202604', amount: 600000 }],
  expenses: [
    {
      id: 'apr-1', month: '202604', label: ' Uber\u3000Eats ',
      amount: -16000, isCarryover: false, aiCategory: null,
    },
    {
      id: 'apr-3', month: '202604', label: ' Uber\u3000Eats ',
      amount: -16000, isCarryover: false, aiCategory: null,
    },
    {
      id: 'apr-2', month: '202604', label: 'Uber Eats',
      amount: -16000, isCarryover: false, aiCategory: null,
    },
    {
      id: 'mar-1', month: '202603', label: 'Uber Eats',
      amount: -32000, isCarryover: false, aiCategory: 'dining',
    },
    {
      id: 'carryover', month: '202604', label: 'Uber Eats',
      amount: -5000, isCarryover: true, aiCategory: null,
    },
  ],
  carryovers: [],
}

const narrative: AiNarrativeResult = {
  summaryText: '家庭全体で今月を振り返りました',
  notableChanges: [
    {
      candidateId: 'increase:dining',
      commentary: '意図した支出か振り返れそうです',
    },
  ],
  positivePoints: [],
  suggestions: [],
  dataSufficiency: 'reference',
}

const savedDiagnosis: AiDiagnosisView = {
  month: '202604',
  summaryText: narrative.summaryText,
  currentExpenseTotal: 48000,
  baselineExpenseAverage: 32000,
  unresolvedCarryoverTotal: 0,
  notableChanges: [],
  positivePoints: [],
  suggestions: [],
  dataSufficiency: 'reference',
}

function createDependencies() {
  let currentContext = structuredClone(context)
  const getContext = vi.fn(async () => structuredClone(currentContext))
  const saveCategories = vi.fn(
    async (
      _month: string,
      _runToken: string,
      assignments: ExpenseCategoryAssignment[]
    ) => {
      const categoriesById = new Map(
        assignments.flatMap(({ expenseIds, category }) =>
          expenseIds.map((expenseId) => [expenseId, category] as const)
        )
      )
      currentContext = {
        ...currentContext,
        expenses: currentContext.expenses.map((expense) => ({
          ...expense,
          aiCategory: categoriesById.get(expense.id) ?? expense.aiCategory,
        })),
      }
    }
  )
  const repository = {
    getContext,
    getSavedDiagnosis: vi.fn().mockResolvedValue(null),
    acquireLease: vi.fn().mockResolvedValue(undefined),
    saveCategories,
    saveDiagnosis: vi
      .fn()
      .mockImplementation(async (_month, input) => input.diagnosis),
    releaseLease: vi.fn().mockResolvedValue(undefined),
  }
  const provider = {
    classifyLabels: vi
      .fn()
      .mockResolvedValue([{ label: 'Uber Eats', category: 'dining' }]),
    generateNarrative: vi.fn().mockResolvedValue(narrative),
  }
  return {
    repository,
    provider,
    randomUUID: vi.fn(() => 'run-token'),
    logReleaseError: vi.fn(),
    setContext(nextContext: DiagnosisContext) {
      currentContext = structuredClone(nextContext)
      getContext.mockImplementation(async () => structuredClone(currentContext))
    },
  }
}

function createUnknownExpenses(
  count: number,
  labelAt: (index: number) => string
): DiagnosisContext['expenses'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `expense-${index + 1}`,
    month: '202604',
    label: labelAt(index),
    amount: -1000,
    isCarryover: false,
    aiCategory: null,
  }))
}


describe('AI家計診断サービス', () => {
  it('未分類の正規化ラベルだけを分類し、exact label単位で保存して元contextを変更しない', async () => {
    const dependencies = createDependencies()
    const originalContext = structuredClone(context)

    const result = await createAiDiagnosisService(dependencies).run('202604')

    expect(dependencies.provider.classifyLabels).toHaveBeenCalledWith([
      'Uber Eats',
    ])
    expect(dependencies.repository.saveCategories).toHaveBeenCalledWith(
      '202604',
      'run-token',
      [
        {
          expenseIds: ['apr-1', 'apr-3'],
          category: 'dining',
          expectedLabel: ' Uber\u3000Eats ',
        },
        {
          expenseIds: ['apr-2'],
          category: 'dining',
          expectedLabel: 'Uber Eats',
        },
      ]
    )
    expect(dependencies.repository.getContext).toHaveBeenCalledTimes(2)
    expect(context).toEqual(originalContext)
    expect(result.notableChanges[0]?.differenceAmount).toBe(16000)
    expect(
      JSON.stringify(dependencies.provider.generateNarrative.mock.calls)
    ).not.toMatch(/husband|wife/)
    expect(dependencies.repository.saveDiagnosis).toHaveBeenCalledWith(
      '202604',
      expect.objectContaining({
        runToken: 'run-token',
        expectedSourceRevision: 7,
        analysisVersion: 'v1',
        inputHash: expect.any(String),
      })
    )
    expect(dependencies.repository.releaseLease).not.toHaveBeenCalled()
    const callOrder = [
      dependencies.repository.acquireLease.mock.invocationCallOrder[0],
      dependencies.repository.getContext.mock.invocationCallOrder[0],
      dependencies.provider.classifyLabels.mock.invocationCallOrder[0],
      dependencies.repository.saveCategories.mock.invocationCallOrder[0],
      dependencies.repository.getContext.mock.invocationCallOrder[1],
      dependencies.repository.getSavedDiagnosis.mock.invocationCallOrder[0],
      dependencies.provider.generateNarrative.mock.invocationCallOrder[0],
      dependencies.repository.saveDiagnosis.mock.invocationCallOrder[0],
    ]
    expect(callOrder).toEqual([...callOrder].sort((left, right) => left - right))
  })

  it('分類保存後はDBを再取得し永続カテゴリでhashと診断を生成する', async () => {
    const dependencies = createDependencies()
    const persistedContext: DiagnosisContext = {
      ...context,
      expenses: context.expenses.map((expense) =>
        expense.isCarryover ? { ...expense } : { ...expense, aiCategory: 'other' }
      ),
    }
    dependencies.repository.saveCategories.mockImplementationOnce(async () => {
      dependencies.setContext(persistedContext)
    })
    dependencies.provider.generateNarrative.mockResolvedValue({
      summaryText: '今月の支出構成を振り返りました',
      notableChanges: [
        { candidateId: 'increase:other', commentary: '振り返れそうです' },
      ],
      positivePoints: [],
      suggestions: [],
      dataSufficiency: 'reference',
    })

    await createAiDiagnosisService(dependencies).run('202604')

    expect(dependencies.provider.generateNarrative).toHaveBeenCalledWith(
      expect.objectContaining({
        notableCandidates: [expect.objectContaining({ category: 'other' })],
        positiveCandidates: [],
        suggestionCandidates: [],
      })
    )
    expect(dependencies.repository.saveDiagnosis).toHaveBeenCalledWith(
      '202604',
      expect.objectContaining({
        inputHash: await createDiagnosisInputHash(persistedContext),
      })
    )
  })

  it('分類待機中に未分類支出が増えてrevisionが変わったら診断前に中断する', async () => {
    const dependencies = createDependencies()
    dependencies.provider.classifyLabels.mockImplementation(async () => {
      dependencies.setContext({
        ...context,
        sourceRevision: 8,
        expenses: [
          ...context.expenses,
          {
            id: 'inserted-during-classification',
            month: '202604',
            label: '新しい未分類支出',
            amount: -8000,
            isCarryover: false,
            aiCategory: null,
          },
        ],
      })
      return [{ label: 'Uber Eats', category: 'dining' }]
    })

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toThrow('診断対象データが更新されたため保存できません')

    expect(dependencies.repository.getContext).toHaveBeenCalledTimes(2)
    expect(dependencies.repository.getSavedDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
    expect(dependencies.repository.saveDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).toHaveBeenCalledWith(
      '202604',
      'run-token'
    )
  })

  it('同一ラベル101件は分類を1回に保ち、保存を100件以下へ分割する', async () => {
    const dependencies = createDependencies()
    dependencies.setContext({
      targetMonth: '202604',
      sourceRevision: 7,
      incomes: [],
      expenses: createUnknownExpenses(101, () => '食料品'),
      carryovers: [],
    })
    dependencies.provider.classifyLabels.mockResolvedValue([
      { label: '食料品', category: 'groceries' },
    ])
    dependencies.provider.generateNarrative.mockResolvedValue({
      summaryText: '今月の支出構成を振り返りました',
      notableChanges: [],
      positivePoints: [],
      suggestions: [],
      dataSufficiency: 'current_only',
    })

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).resolves.toEqual(expect.objectContaining({ month: '202604' }))

    expect(dependencies.provider.classifyLabels).toHaveBeenCalledOnce()
    expect(dependencies.provider.classifyLabels).toHaveBeenCalledWith(['食料品'])
    expect(dependencies.repository.saveCategories).toHaveBeenCalledTimes(2)
    expect(
      dependencies.repository.saveCategories.mock.calls.map((call) =>
        (call[2] as ExpenseCategoryAssignment[]).reduce(
          (count: number, assignment: ExpenseCategoryAssignment) =>
            count + assignment.expenseIds.length,
          0
        )
      )
    ).toEqual([100, 1])
  })

  it('正規化ラベル101種類は安定順の先頭100種類だけを1回分類し超過分をotherにする', async () => {
    const dependencies = createDependencies()
    dependencies.setContext({
      targetMonth: '202604',
      sourceRevision: 7,
      incomes: [],
      expenses: createUnknownExpenses(
        101,
        (index) => `分類ラベル${String(101 - index).padStart(3, '0')}`
      ),
      carryovers: [],
    })
    dependencies.provider.classifyLabels.mockImplementation(
      async (labels: string[]) =>
        labels.map((label) => ({ label, category: 'groceries' as const }))
    )
    dependencies.provider.generateNarrative.mockResolvedValue({
      summaryText: '今月の支出構成を振り返りました',
      notableChanges: [],
      positivePoints: [],
      suggestions: [],
      dataSufficiency: 'current_only',
    })

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).resolves.toEqual(expect.objectContaining({ month: '202604' }))

    expect(dependencies.provider.classifyLabels).toHaveBeenCalledOnce()
    expect(dependencies.provider.classifyLabels.mock.calls[0][0]).toEqual(
      Array.from(
        { length: 100 },
        (_, index) => `分類ラベル${String(index + 1).padStart(3, '0')}`
      )
    )
    expect(dependencies.repository.saveCategories).toHaveBeenCalledTimes(2)
    const savedAssignments = dependencies.repository.saveCategories.mock.calls.flatMap(
      (call) => call[2] as ExpenseCategoryAssignment[]
    )
    expect(savedAssignments.flatMap(({ expenseIds }) => expenseIds)).toHaveLength(101)
    expect(
      savedAssignments.find(({ expectedLabel }) => expectedLabel === '分類ラベル101')
    ).toEqual(expect.objectContaining({ category: 'other' }))
  })

  it('後続の保存batch失敗後は永続化済み分類を再利用して残りだけ分類する', async () => {
    const dependencies = createDependencies()
    const expenses = createUnknownExpenses(101, () => '食料品')
    const saveError = new Error('category save batch failed')
    dependencies.setContext({
      targetMonth: '202604', sourceRevision: 7, incomes: [], expenses, carryovers: [],
    })
    dependencies.provider.classifyLabels.mockResolvedValue([
      { label: '食料品', category: 'groceries' },
    ])
    dependencies.provider.generateNarrative.mockResolvedValue({
      summaryText: '今月の支出構成を振り返りました',
      notableChanges: [], positivePoints: [], suggestions: [],
      dataSufficiency: 'current_only',
    })
    dependencies.repository.saveCategories
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(saveError)

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toBe(saveError)
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).toHaveBeenCalledOnce()

    dependencies.setContext({
      targetMonth: '202604',
      sourceRevision: 7,
      incomes: [],
      expenses: expenses.map((expense, index) =>
        index < 100 ? { ...expense, aiCategory: 'groceries' } : expense
      ),
      carryovers: [],
    })
    dependencies.repository.saveCategories.mockReset()
    dependencies.repository.saveCategories.mockResolvedValue(undefined)
    dependencies.provider.classifyLabels.mockClear()
    dependencies.provider.generateNarrative.mockClear()
    dependencies.repository.releaseLease.mockClear()

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).resolves.toEqual(expect.objectContaining({ month: '202604' }))
    expect(dependencies.provider.classifyLabels).toHaveBeenCalledWith(['食料品'])
    expect(dependencies.repository.saveCategories).toHaveBeenCalledWith(
      '202604',
      'run-token',
      [{
        expenseIds: ['expense-101'],
        category: 'groceries',
        expectedLabel: '食料品',
      }]
    )
    expect(dependencies.provider.generateNarrative).toHaveBeenCalledOnce()
    expect(dependencies.repository.releaseLease).not.toHaveBeenCalled()
  })

  it('loadはAIとリースを使わず保存なし・新鮮・期限切れを判定する', async () => {
    const inputHash = await createDiagnosisInputHash(context)
    const dependencies = createDependencies()
    const service = createAiDiagnosisService(dependencies)

    await expect(service.load('202604')).resolves.toEqual({
      diagnosis: null,
      stale: false,
    })

    dependencies.repository.getSavedDiagnosis.mockResolvedValueOnce({
      diagnosis: savedDiagnosis,
      inputHash,
      analysisVersion: 'v1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    await expect(service.load('202604')).resolves.toEqual({
      diagnosis: savedDiagnosis,
      stale: false,
    })

    dependencies.repository.getSavedDiagnosis.mockResolvedValueOnce({
      diagnosis: savedDiagnosis,
      inputHash: 'old-hash',
      analysisVersion: 'v0',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })
    await expect(service.load('202604')).resolves.toEqual({
      diagnosis: savedDiagnosis,
      stale: true,
    })

    expect(dependencies.repository.acquireLease).not.toHaveBeenCalled()
    expect(dependencies.repository.saveCategories).not.toHaveBeenCalled()
    expect(dependencies.provider.classifyLabels).not.toHaveBeenCalled()
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
  })

  it.each([
    ['hashのみ不一致', 'old-hash', 'v1'],
    ['versionのみ不一致', null, 'v0'],
  ] as const)('loadは%sを独立して期限切れ判定する', async (_name, hash, version) => {
    const inputHash = await createDiagnosisInputHash(context)
    const dependencies = createDependencies()
    dependencies.repository.getSavedDiagnosis.mockResolvedValue({
      diagnosis: savedDiagnosis,
      inputHash: hash ?? inputHash,
      analysisVersion: version,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    await expect(createAiDiagnosisService(dependencies).load('202604')).resolves.toEqual({
      diagnosis: savedDiagnosis,
      stale: true,
    })
  })

  it.each([
    ['hashのみ不一致', 'old-hash', 'v1'],
    ['versionのみ不一致', null, 'v0'],
  ] as const)('runは%sの保存結果を再利用せず再生成する', async (_name, hash, version) => {
    const classifiedContext: DiagnosisContext = {
      ...context,
      expenses: context.expenses.map((expense) =>
        expense.isCarryover ? expense : { ...expense, aiCategory: 'dining' }
      ),
    }
    const inputHash = await createDiagnosisInputHash(classifiedContext)
    const dependencies = createDependencies()
    dependencies.setContext(classifiedContext)
    dependencies.repository.getSavedDiagnosis.mockResolvedValue({
      diagnosis: savedDiagnosis,
      inputHash: hash ?? inputHash,
      analysisVersion: version,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    await createAiDiagnosisService(dependencies).run('202604')

    expect(dependencies.provider.generateNarrative).toHaveBeenCalledOnce()
    expect(dependencies.repository.saveDiagnosis).toHaveBeenCalledOnce()
    expect(dependencies.repository.releaseLease).not.toHaveBeenCalled()
  })

  it('narrativeへfixture record IDとperson sentinelを送らない', async () => {
    const dependencies = createDependencies()
    dependencies.setContext({
      ...context,
      expenses: context.expenses.map((expense) => ({
        ...expense,
        id: `fixture-record-${expense.id}`,
        aiCategory: expense.isCarryover ? null : 'dining',
        person: expense.id === 'apr-1' ? 'husband' : 'wife',
      })) as DiagnosisContext['expenses'],
    })

    await createAiDiagnosisService(dependencies).run('202604')

    const payload = JSON.stringify(dependencies.provider.generateNarrative.mock.calls)
    expect(payload).not.toMatch(/fixture-record|"person"|husband|wife/)
  })

  it('runは入力指紋が一致する保存済み診断もsource revision CASで再保存する', async () => {
    const classifiedContext: DiagnosisContext = {
      ...context,
      expenses: context.expenses.map((expense) =>
        expense.isCarryover ? expense : { ...expense, aiCategory: 'dining' }
      ),
    }
    const inputHash = await createDiagnosisInputHash(classifiedContext)
    const dependencies = createDependencies()
    dependencies.setContext(classifiedContext)
    dependencies.repository.getSavedDiagnosis.mockResolvedValue({
      diagnosis: savedDiagnosis,
      inputHash,
      analysisVersion: 'v1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).resolves.toBe(savedDiagnosis)

    expect(dependencies.repository.acquireLease).toHaveBeenCalledWith(
      '202604',
      'run-token'
    )
    expect(dependencies.repository.saveDiagnosis).toHaveBeenCalledWith(
      '202604',
      {
        runToken: 'run-token',
        inputHash,
        analysisVersion: 'v1',
        diagnosis: savedDiagnosis,
        expectedSourceRevision: 7,
      }
    )
    expect(dependencies.repository.releaseLease).not.toHaveBeenCalled()
    expect(dependencies.provider.classifyLabels).not.toHaveBeenCalled()
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
  })

  it('fresh cacheのsource revision CAS競合を成功扱いせずリース解放を試みる', async () => {
    const classifiedContext: DiagnosisContext = {
      ...context,
      expenses: context.expenses.map((expense) =>
        expense.isCarryover ? expense : { ...expense, aiCategory: 'dining' }
      ),
    }
    const inputHash = await createDiagnosisInputHash(classifiedContext)
    const dependencies = createDependencies()
    const sourceConflict = new Error('source revision conflict')
    dependencies.setContext(classifiedContext)
    dependencies.repository.getSavedDiagnosis.mockResolvedValue({
      diagnosis: savedDiagnosis,
      inputHash,
      analysisVersion: 'v1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    dependencies.repository.saveDiagnosis.mockRejectedValueOnce(sourceConflict)

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toBe(sourceConflict)

    expect(dependencies.repository.releaseLease).toHaveBeenCalledOnce()
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
    expect(dependencies.repository.saveDiagnosis).toHaveBeenCalledOnce()
  })

  it('リース取得競合では処理を開始せず、自分が所有しないリースを解放しない', async () => {
    const dependencies = createDependencies()
    const conflict = new Error('lease conflict')
    dependencies.repository.acquireLease.mockRejectedValue(conflict)

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toBe(conflict)

    expect(dependencies.repository.getContext).not.toHaveBeenCalled()
    expect(dependencies.provider.classifyLabels).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).not.toHaveBeenCalled()
  })

  it('当月に実支出がなければAIを呼ばず、取得済みリースを解放する', async () => {
    const dependencies = createDependencies()
    dependencies.setContext({
      ...context,
      expenses: context.expenses.map((expense) => ({
        ...expense,
        isCarryover: true,
      })),
    })

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toThrow('診断できる実支出データがありません')

    expect(dependencies.provider.classifyLabels).not.toHaveBeenCalled()
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).toHaveBeenCalledWith(
      '202604',
      'run-token'
    )
  })

  it('分類保存が競合したら古いcontextで診断を続けずリースを解放する', async () => {
    const dependencies = createDependencies()
    const categoryConflict = new Error('category conflict')
    dependencies.repository.saveCategories.mockRejectedValue(categoryConflict)

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toBe(categoryConflict)

    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
    expect(dependencies.repository.getSavedDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.repository.saveDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).toHaveBeenCalledWith(
      '202604',
      'run-token'
    )
  })

  it('診断生成失敗時も保存済み分類を保持してリースを解放する', async () => {
    const dependencies = createDependencies()
    const narrativeError = new Error('AI unavailable')
    dependencies.provider.generateNarrative.mockRejectedValue(narrativeError)

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toBe(narrativeError)

    expect(dependencies.repository.saveCategories).toHaveBeenCalledOnce()
    expect(dependencies.repository.saveDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).toHaveBeenCalledWith(
      '202604',
      'run-token'
    )
  })

  it('失敗時のリース解放も失敗しても元エラーを保ち、解放エラーだけloggerへ渡す', async () => {
    const dependencies = createDependencies()
    const originalError = new Error('context unavailable')
    const releaseError = new Error('release unavailable')
    dependencies.repository.getContext.mockRejectedValue(originalError)
    dependencies.repository.releaseLease.mockRejectedValue(releaseError)

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toBe(originalError)

    expect(dependencies.logReleaseError).toHaveBeenCalledWith(releaseError)
  })

  it('分類結果が入力ラベルへ完全対応しなければ保存も診断も行わない', async () => {
    const dependencies = createDependencies()
    dependencies.provider.classifyLabels.mockResolvedValue([])

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toThrow('分類結果が入力ラベルと完全に対応していません')

    expect(dependencies.repository.saveCategories).not.toHaveBeenCalled()
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).toHaveBeenCalledOnce()
  })

  it('決定的候補をproviderが全省略した結果をfresh保存しない', async () => {
    const dependencies = createDependencies()
    dependencies.provider.generateNarrative.mockResolvedValue({
      summaryText: '大きな変化はありません',
      notableChanges: [],
      positivePoints: [],
      suggestions: [],
      dataSufficiency: 'reference',
    })

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toThrow('候補があるグループ')
    expect(dependencies.repository.saveDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.repository.releaseLease).toHaveBeenCalledOnce()
  })

  it.each([
    ['分類API', 'classifyLabels'],
    ['保存済み診断取得', 'getSavedDiagnosis'],
    ['診断保存', 'saveDiagnosis'],
  ] as const)('%sの失敗時はリースを解放する', async (_label, stage) => {
    const dependencies = createDependencies()
    const stageError = new Error(`${stage} failed`)
    if (stage === 'classifyLabels') {
      dependencies.provider.classifyLabels.mockRejectedValue(stageError)
    } else {
      dependencies.repository[stage].mockRejectedValue(stageError)
    }

    await expect(
      createAiDiagnosisService(dependencies).run('202604')
    ).rejects.toBe(stageError)

    expect(dependencies.repository.releaseLease).toHaveBeenCalledWith(
      '202604',
      'run-token'
    )
  })
})
