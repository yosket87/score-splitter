import { beforeEach, describe, expect, it, vi } from 'vitest'

import '../../../tests/mocks/next'
import '../../../tests/mocks/api'
import { mockRedirect } from '../../../tests/mocks/next'
import {
  mockAuthenticatedSession,
  mockUnauthenticatedSession,
} from '../../../tests/mocks/helpers'

const aiDiagnosisApiMock = vi.hoisted(() => ({
  getDiagnosisContext: vi.fn(),
  getSavedDiagnosis: vi.fn(),
  acquireDiagnosisLease: vi.fn(),
  saveExpenseCategories: vi.fn(),
  saveDiagnosis: vi.fn(),
  releaseDiagnosisLease: vi.fn(),
}))

const providerFactoryMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/ai-diagnosis', () => aiDiagnosisApiMock)
vi.mock('@/features/ai-diagnosis/provider', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('@/features/ai-diagnosis/provider')
  >()
  return { ...original, createAiDiagnosisProvider: providerFactoryMock }
})

import type {
  AiDiagnosisView,
  AiNarrativeResult,
  DiagnosisContext,
} from '@/features/ai-diagnosis/domain'
import { createDiagnosisInputHash } from '@/features/ai-diagnosis/input-hash'
import { createAiDiagnosisService } from '@/features/ai-diagnosis/service'
import { ApiError } from '@/lib/api/client'
import {
  generateAiDiagnosis,
  loadAiDiagnosis,
} from '@/app/actions/ai-diagnosis'

const context: DiagnosisContext = {
  targetMonth: '202604',
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
  const repository = {
    getContext: vi.fn().mockResolvedValue(context),
    getSavedDiagnosis: vi.fn().mockResolvedValue(null),
    acquireLease: vi.fn().mockResolvedValue(undefined),
    saveCategories: vi.fn().mockResolvedValue(undefined),
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
  }
}

describe('AI家計診断サービス', () => {
  it('未分類の正規化ラベルだけを分類し、exact label単位で保存して元contextを変更しない', async () => {
    const dependencies = createDependencies()
    const originalContext = structuredClone(context)

    const result = await createAiDiagnosisService(dependencies).run('202604')

    expect(dependencies.provider.classifyLabels).toHaveBeenCalledWith([
      'Uber Eats',
    ])
    expect(dependencies.repository.saveCategories).toHaveBeenCalledWith([
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
    ])
    expect(context).toEqual(originalContext)
    expect(result.notableChanges[0]?.differenceAmount).toBe(16000)
    expect(
      JSON.stringify(dependencies.provider.generateNarrative.mock.calls)
    ).not.toMatch(/husband|wife/)
    expect(dependencies.repository.saveDiagnosis).toHaveBeenCalledWith(
      '202604',
      expect.objectContaining({
        runToken: 'run-token',
        analysisVersion: 'v1',
        inputHash: expect.any(String),
      })
    )
    expect(dependencies.repository.releaseLease).not.toHaveBeenCalled()
    const callOrder = [
      dependencies.repository.acquireLease,
      dependencies.repository.getContext,
      dependencies.provider.classifyLabels,
      dependencies.repository.saveCategories,
      dependencies.repository.getSavedDiagnosis,
      dependencies.provider.generateNarrative,
      dependencies.repository.saveDiagnosis,
    ].map((mock) => mock.mock.invocationCallOrder[0])
    expect(callOrder).toEqual([...callOrder].sort((left, right) => left - right))
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

  it('runは入力指紋が一致する保存済み診断を再利用してリースを解放する', async () => {
    const classifiedContext: DiagnosisContext = {
      ...context,
      expenses: context.expenses.map((expense) =>
        expense.isCarryover ? expense : { ...expense, aiCategory: 'dining' }
      ),
    }
    const inputHash = await createDiagnosisInputHash(classifiedContext)
    const dependencies = createDependencies()
    dependencies.repository.getContext.mockResolvedValue(classifiedContext)
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
    expect(dependencies.repository.releaseLease).toHaveBeenCalledWith(
      '202604',
      'run-token'
    )
    expect(dependencies.provider.classifyLabels).not.toHaveBeenCalled()
    expect(dependencies.provider.generateNarrative).not.toHaveBeenCalled()
    expect(dependencies.repository.saveDiagnosis).not.toHaveBeenCalled()
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
    dependencies.repository.getContext.mockResolvedValue({
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

describe('AI家計診断Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedSession()
    aiDiagnosisApiMock.getDiagnosisContext.mockResolvedValue(context)
    aiDiagnosisApiMock.getSavedDiagnosis.mockResolvedValue(null)
    aiDiagnosisApiMock.acquireDiagnosisLease.mockResolvedValue(undefined)
    aiDiagnosisApiMock.saveExpenseCategories.mockResolvedValue(undefined)
    aiDiagnosisApiMock.saveDiagnosis.mockImplementation(
      async (_month, input) => input.diagnosis
    )
    aiDiagnosisApiMock.releaseDiagnosisLease.mockResolvedValue(undefined)
    providerFactoryMock.mockReturnValue({
      classifyLabels: vi
        .fn()
        .mockResolvedValue([{ label: 'Uber Eats', category: 'dining' }]),
      generateNarrative: vi.fn().mockResolvedValue(narrative),
    })
  })

  it('未認証時は先頭でリダイレクトしrepositoryとproviderを生成しない', async () => {
    mockUnauthenticatedSession()

    await expect(loadAiDiagnosis('202604')).rejects.toThrow(
      'NEXT_REDIRECT:/login'
    )

    expect(mockRedirect).toHaveBeenCalledWith('/login')
    expect(providerFactoryMock).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.getDiagnosisContext).not.toHaveBeenCalled()
  })

  it('generateも未認証時は先頭でリダイレクトし外部依存を呼ばない', async () => {
    mockUnauthenticatedSession()

    await expect(generateAiDiagnosis('202604')).rejects.toThrow(
      'NEXT_REDIRECT:/login'
    )

    expect(providerFactoryMock).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.acquireDiagnosisLease).not.toHaveBeenCalled()
  })

  it.each(['202613', '202600', '2026-04', ''])(
    '意味的に無効な月 %s はfactory生成前に拒否する',
    async (month) => {
      await expect(loadAiDiagnosis(month)).resolves.toEqual({
        success: false,
        error: '月の形式が不正です',
      })
      expect(providerFactoryMock).not.toHaveBeenCalled()
      expect(aiDiagnosisApiMock.getDiagnosisContext).not.toHaveBeenCalled()
    }
  )

  it('generateも意味的に無効な月をfactory生成前に拒否する', async () => {
    await expect(generateAiDiagnosis('202613')).resolves.toEqual({
      success: false,
      error: '月の形式が不正です',
    })
    expect(providerFactoryMock).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.acquireDiagnosisLease).not.toHaveBeenCalled()
  })

  it('loadはrequest内でfactoryを生成してsnapshotを返す', async () => {
    await expect(loadAiDiagnosis('202604')).resolves.toEqual({
      success: true,
      data: { diagnosis: null, stale: false },
    })

    expect(providerFactoryMock).toHaveBeenCalledOnce()
    expect(aiDiagnosisApiMock.getDiagnosisContext).toHaveBeenCalledWith('202604')
    expect(aiDiagnosisApiMock.acquireDiagnosisLease).not.toHaveBeenCalled()
  })

  it('generateはrequest内でfactoryを生成して診断を返す', async () => {
    const result = await generateAiDiagnosis('202604')

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ month: '202604' }),
    })
    expect(providerFactoryMock).toHaveBeenCalledOnce()
    expect(aiDiagnosisApiMock.acquireDiagnosisLease).toHaveBeenCalledOnce()
  })

  it('リース競合を実行中メッセージへ変換する', async () => {
    aiDiagnosisApiMock.acquireDiagnosisLease.mockRejectedValue(
      new ApiError('秘密を含む可能性があるAPIメッセージ', 409)
    )

    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: false,
      error: '診断を実行中です',
    })
    expect(aiDiagnosisApiMock.getDiagnosisContext).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.releaseDiagnosisLease).not.toHaveBeenCalled()
  })

  it('当月実支出0件を専用メッセージへ変換する', async () => {
    aiDiagnosisApiMock.getDiagnosisContext.mockResolvedValue({
      ...context,
      expenses: context.expenses.map((expense) => ({
        ...expense,
        isCarryover: true,
      })),
    })

    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: false,
      error: '診断できる支出データがありません',
    })
    expect(aiDiagnosisApiMock.releaseDiagnosisLease).toHaveBeenCalledOnce()
  })

  it('一般エラーは詳細を応答・ログへ出さず固定メッセージへ変換する', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    aiDiagnosisApiMock.getDiagnosisContext.mockRejectedValue(
      new Error('Uber Eats -32000 API_KEY=secret')
    )

    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: false,
      error: 'AI診断に失敗しました',
    })
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
      /Uber Eats|-32000|secret/
    )
    consoleError.mockRestore()
  })
})
