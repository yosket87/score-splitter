import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import {
  clearApiMocks,
  mockMonthlySummaryApi,
} from '../../../tests/mocks/api'
import { getMonthlySummaries } from '@/app/actions/monthly-summary'

describe('monthly-summary actions', () => {
  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
  })

  it('APIから取得した月別金額を集計する', async () => {
    mockMonthlySummaryApi.getMonthlyAmounts.mockResolvedValueOnce({
      incomes: [
        { month: '202601', amount: 300000 },
        { month: '202602', amount: 320000 },
      ],
      expenses: [
        { month: '202601', amount: -120000 },
        { month: '202602', amount: -150000 },
      ],
    })

    const result = await getMonthlySummaries()

    expect(mockMonthlySummaryApi.getMonthlyAmounts).toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      {
        month: '202602',
        incomeTotal: 320000,
        expenseTotal: -150000,
        balance: 170000,
      },
      {
        month: '202601',
        incomeTotal: 300000,
        expenseTotal: -120000,
        balance: 180000,
      },
    ])
  })

  it('APIエラー時はユーザー向けエラーを返す', async () => {
    mockMonthlySummaryApi.getMonthlyAmounts.mockRejectedValueOnce(new Error('API error'))

    const result = await getMonthlySummaries()

    expect(result).toEqual({
      success: false,
      error: '月別サマリーの取得に失敗しました',
    })
  })
})
