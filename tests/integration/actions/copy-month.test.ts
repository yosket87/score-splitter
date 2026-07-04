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
      carryoverCount: 1,
      existingCount: 2,
    }
    mockCopyMonthApi.getCopyMonthPreview.mockResolvedValueOnce(preview)

    const result = await getCopyMonthPreview('202601', '202602')

    expect(mockCopyMonthApi.getCopyMonthPreview).toHaveBeenCalledWith('202601', '202602')
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

    expect(mockCopyMonthApi.copyMonthData).toHaveBeenCalledWith(options)
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
