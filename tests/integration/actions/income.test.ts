import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import {
  clearApiMocks,
  mockRecordsApi,
} from '../../../tests/mocks/api'
import { mockRevalidatePath } from '../../../tests/mocks/next'
import { createFormData } from '../../../tests/mocks/helpers'
import {
  createIncome,
  deleteIncome,
  getIncomesByMonth,
  updateIncome,
} from '@/app/actions/income'

describe('income actions', () => {
  beforeEach(() => {
    clearApiMocks()
    mockRevalidatePath.mockClear()
    vi.clearAllMocks()
  })

  it('指定月の収入をAPIから取得する', async () => {
    const incomes = [
      {
        id: 'income-1',
        month: '202601',
        label: '給料',
        amount: 300000,
        person: 'husband' as const,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]
    mockRecordsApi.getIncomesByMonth.mockResolvedValueOnce(incomes)

    const result = await getIncomesByMonth('202601')

    expect(mockRecordsApi.getIncomesByMonth).toHaveBeenCalledWith('202601')
    expect(result).toEqual({ success: true, data: incomes })
  })

  it('取得エラー時はユーザー向けエラーを返す', async () => {
    mockRecordsApi.getIncomesByMonth.mockRejectedValueOnce(new Error('API error'))

    const result = await getIncomesByMonth('202601')

    expect(result).toEqual({
      success: false,
      error: '収入データの取得に失敗しました',
    })
  })

  it('有効なデータで収入を作成する', async () => {
    const income = {
      id: 'income-1',
      month: '202601',
      label: '給料',
      amount: 300000,
      person: 'husband' as const,
      createdAt: '2026-01-01T00:00:00Z',
    }
    mockRecordsApi.createIncome.mockResolvedValueOnce(income)

    const result = await createIncome(
      createFormData({
        month: '202601',
        label: '給料',
        amount: 300000,
        person: 'husband',
      })
    )

    expect(mockRecordsApi.createIncome).toHaveBeenCalledWith({
      month: '202601',
      label: '給料',
      amount: 300000,
      person: 'husband',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true, data: income })
  })

  it('バリデーションエラー時はAPIを呼ばない', async () => {
    const result = await createIncome(
      createFormData({
        month: '202601',
        label: '',
        amount: 300000,
        person: 'husband',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('項目名を入力してください')
    expect(mockRecordsApi.createIncome).not.toHaveBeenCalled()
  })

  it('収入を更新する', async () => {
    const income = {
      id: 'income-1',
      month: '202601',
      label: '更新後',
      amount: 250000,
      person: 'wife' as const,
      createdAt: '2026-01-01T00:00:00Z',
    }
    mockRecordsApi.updateIncome.mockResolvedValueOnce(income)

    const result = await updateIncome(
      'income-1',
      createFormData({
        month: '202601',
        label: '更新後',
        amount: 250000,
        person: 'wife',
      })
    )

    expect(mockRecordsApi.updateIncome).toHaveBeenCalledWith('income-1', {
      month: '202601',
      label: '更新後',
      amount: 250000,
      person: 'wife',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true, data: income })
  })

  it('収入を削除する', async () => {
    mockRecordsApi.deleteIncome.mockResolvedValueOnce(undefined)

    const result = await deleteIncome('income-1')

    expect(mockRecordsApi.deleteIncome).toHaveBeenCalledWith('income-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true })
  })
})
