import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import {
  clearApiMocks,
  mockCopyMonthApi,
} from '../../../tests/mocks/api'
import { mockRedirect, mockRevalidatePath } from '../../../tests/mocks/next'
import {
  mockAuthenticatedSession,
  mockUnauthenticatedSession,
} from '../../../tests/mocks/helpers'
import type { CopyMonthOptions } from '@/types'
import {
  copyMonthData,
  getCopyMonthPreview,
} from '@/app/actions/copy-month'

describe('copy-month actions', () => {
  beforeEach(() => {
    clearApiMocks()
    mockRevalidatePath.mockClear()
    vi.clearAllMocks()
    mockAuthenticatedSession()
  })

  it('月コピープレビューをAPIから取得する', async () => {
    const preview = {
      sourceMonth: '202601',
      targetMonth: '202602',
      items: [
        {
          id: 'income-1',
          label: '給料',
          amount: 300000,
          person: 'husband' as const,
          type: 'income' as const,
        },
      ],
      carryoverFingerprint: "fingerprint",
      carryoverCount: 1,
      existingCount: 2,
    }
    mockCopyMonthApi.getCopyMonthPreview.mockResolvedValueOnce(preview)

    const result = await getCopyMonthPreview('202601', '202602')

    expect(mockCopyMonthApi.getCopyMonthPreview).toHaveBeenCalledWith({householdId:'A',person:null,authMethod:'password'}, '202601', '202602')
    expect(result).toEqual({ success: true, data: preview })
  })

  it('無効セッション時はログインへリダイレクトしてAPIを呼ばない', async () => {
    mockUnauthenticatedSession()

    await expect(getCopyMonthPreview('202601', '202602')).rejects.toThrow(
      'NEXT_REDIRECT:/login'
    )

    expect(mockRedirect).toHaveBeenCalledWith('/login')
    expect(mockCopyMonthApi.getCopyMonthPreview).not.toHaveBeenCalled()
  })

  it('月コピーAPIを呼び、成功時にrevalidateする', async () => {
    const options: CopyMonthOptions = {
      sourceMonth: '202601',
      targetMonth: '202602',
      mode: 'replace',
      includeCarryover: true,
      selectedItems: [
        {
          id: 'income-1',
          label: '給料',
          amount: 300000,
          person: 'husband',
          type: 'income',
          itemCopyMode: 'withAmount',
        },
      ],
    }
    const copyResult = {
      success: true,
      copied: { incomes: 1, expenses: 0, carryovers: 1 },
      skipped: { incomes: 0, expenses: 0, carryovers: 0 },
    }
    mockCopyMonthApi.copyMonthData.mockResolvedValueOnce(copyResult)

    const result = await copyMonthData(options)

    expect(mockCopyMonthApi.copyMonthData).toHaveBeenCalledWith({householdId:'A',person:null,authMethod:'password'}, options)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/2026/02')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/2026')
    expect(result).toEqual({ success: true, data: copyResult })
  })

  it('APIエラー時は失敗結果を返す', async () => {
    const options: CopyMonthOptions = {
      sourceMonth: '202601',
      targetMonth: '202602',
      mode: 'replace',
      includeCarryover: false,
      selectedItems: [],
    }
    mockCopyMonthApi.copyMonthData.mockRejectedValueOnce(new Error('API error'))

    const result = await copyMonthData(options)

    expect(result).toEqual({
      success: false,
      error: 'API error',
    })
  })
})

// Actionの検証を外すと、不正入力がAPIへ渡されることを検出する。
describe('copy-month input boundary', () => {
  const item = {
    id: 'income-1', label: '給料', amount: 300000,
    person: 'husband', type: 'income', itemCopyMode: 'withAmount',
  }
  const options = {
    sourceMonth: '202601', targetMonth: '202602', mode: 'add',
    includeCarryover: false, selectedItems: [item],
  }

  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
    mockAuthenticatedSession()
  })

  it.each([
    ['202600', '202602'], ['202613', '202602'], ['202601', '202600'],
    ['202601', '202613'], ['2026-01', '202602'], ['', '202602'],
  ])('不正な月 %s → %s のプレビューをAPI前に拒否する', async (source, target) => {
    const result = await getCopyMonthPreview(source, target)
    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockCopyMonthApi.getCopyMonthPreview).not.toHaveBeenCalled()
  })

  it.each([
    null, [], { ...options, sourceMonth: '202600' },
    { ...options, targetMonth: '202613' },
    { ...options, targetMonth: options.sourceMonth },
    { ...options, mode: 'unknown' }, { ...options, includeCarryover: 'false' },
    { ...options, selectedItems: null }, { ...options, carryoverFingerprint: 123 },
    ...[
      { id: '' }, { id: '  ' }, { label: '' }, { person: 'other' },
      { type: 'carryover' }, { itemCopyMode: 'unknown' },
      { amount: '100' }, { amount: 0 }, { amount: -1 }, { amount: 1.5 },
      { amount: Infinity }, { type: 'expense', amount: 100 },
    ].map(patch => ({ ...options, selectedItems: [{ ...item, ...patch }] })),
  ])('不正なコピー入力 %# をAPIと再検証前に拒否する', async (input) => {
    const result = await copyMonthData(input as unknown as CopyMonthOptions)
    expect(result).toMatchObject({ success: false, error: expect.any(String) })
    expect(mockCopyMonthApi.copyMonthData).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('不正入力でも認証を先に要求する', async () => {
    mockUnauthenticatedSession()
    await expect(copyMonthData(null as unknown as CopyMonthOptions)).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mockCopyMonthApi.copyMonthData).not.toHaveBeenCalled()
  })

  it.each(['add', 'skip', 'replace'] as const)('正常な%s・項目名のみ・繰越指紋を保持する', async mode => {
    const input: CopyMonthOptions = {
      ...options, mode, includeCarryover: true, carryoverFingerprint: 'fingerprint',
      selectedItems: [
        { ...item, person: 'husband', type: 'income', itemCopyMode: 'withAmount' },
        { ...item, id: 'expense-1', amount: -200, person: 'wife', type: 'expense', itemCopyMode: 'withAmount' },
        { ...item, id: 'expense-2', amount: 0, person: 'wife', type: 'expense', itemCopyMode: 'labelOnly' },
      ],
    }
    const data = { success: true, copied: { incomes: 1, expenses: 2, carryovers: 1 }, skipped: { incomes: 0, expenses: 0, carryovers: 0 } }
    mockCopyMonthApi.copyMonthData.mockResolvedValueOnce(data)
    expect(await copyMonthData(input)).toEqual({ success: true, data })
    expect(mockCopyMonthApi.copyMonthData).toHaveBeenCalledWith(expect.any(Object), input)
  })
})
