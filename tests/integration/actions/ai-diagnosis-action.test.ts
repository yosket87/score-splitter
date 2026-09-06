import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APIConnectionTimeoutError } from 'openai/core/error'

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
import { ApiError } from '@/lib/api/client'
import {
  generateAiDiagnosis,
  loadAiDiagnosis,
} from '@/app/actions/ai-diagnosis'

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

const classifiedContext: DiagnosisContext = {
  ...context,
  expenses: context.expenses.map((expense) =>
    expense.isCarryover ? { ...expense } : { ...expense, aiCategory: 'dining' }
  ),
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


describe('AI家計診断Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedSession()
    aiDiagnosisApiMock.getDiagnosisContext.mockResolvedValue(context)
    aiDiagnosisApiMock.getSavedDiagnosis.mockResolvedValue(null)
    aiDiagnosisApiMock.acquireDiagnosisLease.mockResolvedValue(undefined)
    aiDiagnosisApiMock.saveExpenseCategories.mockImplementation(async () => {
      aiDiagnosisApiMock.getDiagnosisContext.mockResolvedValue(classifiedContext)
    })
    aiDiagnosisApiMock.saveDiagnosis.mockImplementation(
      async (_context, _month, input) => input.diagnosis
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

  it('loadはOpenAI providerを生成せずsnapshotを返す', async () => {
    await expect(loadAiDiagnosis('202604')).resolves.toEqual({
      success: true,
      data: { diagnosis: null, stale: false },
    })

    expect(providerFactoryMock).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.getDiagnosisContext).toHaveBeenCalledWith(expect.objectContaining({ householdId: 'A' }), '202604')
    expect(aiDiagnosisApiMock.acquireDiagnosisLease).not.toHaveBeenCalled()
  })

  it('provider factoryが失敗してもloadは保存なし・fresh・staleのsnapshotを返す', async () => {
    const inputHash = await createDiagnosisInputHash(context)
    providerFactoryMock.mockImplementation(() => {
      throw new Error('OPENAI_API_KEY missing')
    })

    await expect(loadAiDiagnosis('202604')).resolves.toEqual({
      success: true,
      data: { diagnosis: null, stale: false },
    })

    aiDiagnosisApiMock.getSavedDiagnosis.mockResolvedValue({
      diagnosis: savedDiagnosis,
      inputHash,
      analysisVersion: 'v1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    await expect(loadAiDiagnosis('202604')).resolves.toEqual({
      success: true,
      data: { diagnosis: savedDiagnosis, stale: false },
    })

    aiDiagnosisApiMock.getSavedDiagnosis.mockResolvedValue({
      diagnosis: savedDiagnosis,
      inputHash: 'old-hash',
      analysisVersion: 'v1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    await expect(loadAiDiagnosis('202604')).resolves.toEqual({
      success: true,
      data: { diagnosis: savedDiagnosis, stale: true },
    })
    expect(providerFactoryMock).not.toHaveBeenCalled()
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

  it('分類待機中のsource revision競合を専用結果にして診断保存へ進まない', async () => {
    aiDiagnosisApiMock.saveExpenseCategories.mockImplementationOnce(async () => {
      aiDiagnosisApiMock.getDiagnosisContext.mockResolvedValue({
        ...classifiedContext,
        sourceRevision: 8,
        expenses: [
          ...classifiedContext.expenses,
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
    })

    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: false,
      error: '家計データが更新されました。最新データで再診断してください',
      errorCode: 'source_revision_conflict',
    })

    const provider = providerFactoryMock.mock.results[0]?.value
    expect(provider.generateNarrative).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.getSavedDiagnosis).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.saveDiagnosis).not.toHaveBeenCalled()
    expect(aiDiagnosisApiMock.releaseDiagnosisLease).toHaveBeenCalledWith(expect.objectContaining({ householdId: 'A' }),
      '202604',
      expect.any(String)
    )
  })

  it('fresh cacheもsource revision CASで確定し、競合時は専用結果へ変換する', async () => {
    const classifiedContext: DiagnosisContext = {
      ...context,
      expenses: context.expenses.map((expense) =>
        expense.isCarryover ? expense : { ...expense, aiCategory: 'dining' }
      ),
    }
    const inputHash = await createDiagnosisInputHash(classifiedContext)
    aiDiagnosisApiMock.getDiagnosisContext.mockResolvedValue(classifiedContext)
    aiDiagnosisApiMock.getSavedDiagnosis.mockResolvedValue({
      diagnosis: savedDiagnosis,
      inputHash,
      analysisVersion: 'v1',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: true,
      data: savedDiagnosis,
    })
    expect(aiDiagnosisApiMock.saveDiagnosis).toHaveBeenCalledWith(expect.objectContaining({ householdId: 'A' }),
      '202604',
      expect.objectContaining({
        diagnosis: savedDiagnosis,
        expectedSourceRevision: 7,
      })
    )
    expect(aiDiagnosisApiMock.releaseDiagnosisLease).not.toHaveBeenCalled()
    expect(providerFactoryMock).not.toHaveBeenCalled()

    aiDiagnosisApiMock.saveDiagnosis.mockRejectedValueOnce(
      new ApiError('診断対象データが更新されたため保存できません', 409)
    )
    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: false,
      error: '家計データが更新されました。最新データで再診断してください',
      errorCode: 'source_revision_conflict',
    })
    expect(aiDiagnosisApiMock.releaseDiagnosisLease).toHaveBeenCalledOnce()
    expect(providerFactoryMock).not.toHaveBeenCalled()
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

  it('source revision競合を再診断用の専用結果へ変換する', async () => {
    aiDiagnosisApiMock.saveDiagnosis.mockRejectedValueOnce(
      new ApiError('診断対象データが更新されたため保存できません', 409)
    )

    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: false,
      error: '家計データが更新されました。最新データで再診断してください',
      errorCode: 'source_revision_conflict',
    })
  })

  it('cooldownと日次上限の429を安全な固定メッセージへ変換する', async () => {
    aiDiagnosisApiMock.acquireDiagnosisLease.mockRejectedValue(
      new ApiError('month=202604 runToken=secret', 429)
    )

    await expect(generateAiDiagnosis('202604')).resolves.toEqual({
      success: false,
      error: 'しばらく待ってから再診断してください',
    })
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

  it('分類のタイムアウトは安全な処理名・種別・時間だけを記録する', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    providerFactoryMock.mockReturnValue({
      classifyLabels: vi.fn().mockRejectedValue(new APIConnectionTimeoutError({
        message: 'API_KEY=secret Uber Eats -32000',
      })),
      generateNarrative: vi.fn(),
    })
    try {
      await expect(generateAiDiagnosis('202604')).resolves.toEqual({
        success: false, error: 'AI診断に失敗しました',
      })
      expect(consoleError).toHaveBeenCalledWith('[ai-diagnosis]', expect.objectContaining({
        stage: 'classify', outcome: 'error', errorKind: 'timeout',
        status: null, elapsedMs: expect.any(Number),
      }))
      expect(JSON.stringify([...consoleError.mock.calls, ...consoleInfo.mock.calls]))
        .not.toMatch(/secret|Uber Eats|-32000|202604/)
      expect(aiDiagnosisApiMock.releaseDiagnosisLease).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
      consoleInfo.mockRestore()
    }
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
