import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import {
  clearApiMocks,
  mockRecordsApi,
} from '../../../tests/mocks/api'
import { mockRevalidatePath } from '../../../tests/mocks/next'
import { createFormData } from '../../../tests/mocks/helpers'
import {
  createExpense,
  deleteExpense,
  getExpensesByMonth,
  toggleExpenseCarryover,
  updateExpense,
} from '@/app/actions/expense'

describe('expense actions', () => {
  beforeEach(() => {
    clearApiMocks()
    mockRevalidatePath.mockClear()
    vi.clearAllMocks()
  })

  it('指定月の支出をAPIから取得する', async () => {
    const expenses = [
      {
        id: 'expense-1',
        month: '202601',
        label: '家賃',
        amount: -120000,
        person: 'wife' as const,
        isCarryover: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]
    mockRecordsApi.getExpensesByMonth.mockResolvedValueOnce(expenses)

    const result = await getExpensesByMonth('202601')

    expect(mockRecordsApi.getExpensesByMonth).toHaveBeenCalledWith('202601')
    expect(result).toEqual({ success: true, data: expenses })
  })

  it('支出作成時は入力金額を負数にしてAPIへ渡す', async () => {
    const expense = {
      id: 'expense-1',
      month: '202601',
      label: '家賃',
      amount: -120000,
      person: 'wife' as const,
      isCarryover: true,
      createdAt: '2026-01-01T00:00:00Z',
    }
    mockRecordsApi.createExpense.mockResolvedValueOnce(expense)

    const result = await createExpense(
      createFormData({
        month: '202601',
        label: '家賃',
        amount: 120000,
        person: 'wife',
        is_carryover: 'true',
      })
    )

    expect(mockRecordsApi.createExpense).toHaveBeenCalledWith({
      month: '202601',
      label: '家賃',
      amount: -120000,
      person: 'wife',
      isCarryover: true,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true, data: expense })
  })

  it('バリデーションエラー時はAPIを呼ばない', async () => {
    const result = await createExpense(
      createFormData({
        month: '202601',
        label: '',
        amount: 120000,
        person: 'wife',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('項目名を入力してください')
    expect(mockRecordsApi.createExpense).not.toHaveBeenCalled()
  })

  it('支出を更新する', async () => {
    const expense = {
      id: 'expense-1',
      month: '202601',
      label: '更新後',
      amount: -10000,
      person: 'husband' as const,
      isCarryover: false,
      createdAt: '2026-01-01T00:00:00Z',
    }
    mockRecordsApi.updateExpense.mockResolvedValueOnce(expense)

    const result = await updateExpense(
      'expense-1',
      createFormData({
        month: '202601',
        label: '更新後',
        amount: 10000,
        person: 'husband',
        is_carryover: 'false',
      })
    )

    expect(mockRecordsApi.updateExpense).toHaveBeenCalledWith('expense-1', {
      month: '202601',
      label: '更新後',
      amount: -10000,
      person: 'husband',
      isCarryover: false,
    })
    expect(result).toEqual({ success: true, data: expense })
  })

  it('支出の繰越フラグを更新する', async () => {
    mockRecordsApi.toggleExpenseCarryover.mockResolvedValueOnce(undefined)

    const result = await toggleExpenseCarryover('expense-1', true)

    expect(mockRecordsApi.toggleExpenseCarryover).toHaveBeenCalledWith('expense-1', true)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true })
  })

  it('支出を削除する', async () => {
    mockRecordsApi.deleteExpense.mockResolvedValueOnce(undefined)

    const result = await deleteExpense('expense-1')

    expect(mockRecordsApi.deleteExpense).toHaveBeenCalledWith('expense-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true })
  })
})
