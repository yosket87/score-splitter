import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import { clearApiMocks, mockRecordsApi } from '../../../tests/mocks/api'
import { mockRevalidatePath } from '../../../tests/mocks/next'
import { createFormData, mockAuthenticatedSession } from '../../../tests/mocks/helpers'
import { createIncome, updateIncome } from '@/app/actions/income'
import { createExpense, updateExpense } from '@/app/actions/expense'
import { createCarryover, updateCarryover } from '@/app/actions/carryover'

describe('項目の月範囲チェック', () => {
  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
    mockAuthenticatedSession()
  })

  const actions = [
    { name: '収入作成', run: createIncome, api: mockRecordsApi.createIncome },
    { name: '収入更新', run: (data: FormData) => updateIncome('income-1', data), api: mockRecordsApi.updateIncome },
    { name: '支出作成', run: createExpense, api: mockRecordsApi.createExpense },
    { name: '支出更新', run: (data: FormData) => updateExpense('expense-1', data), api: mockRecordsApi.updateExpense },
    { name: '繰越作成', run: createCarryover, api: mockRecordsApi.createCarryover },
    { name: '繰越更新', run: (data: FormData) => updateCarryover('carryover-1', data), api: mockRecordsApi.updateCarryover },
  ]

  describe.each(actions)('$name', ({ run, api }) => {
    it.each(['202600', '202613', '000099'])('%sをAPIへ送信せず拒否する', async (month) => {
      const result = await run(createFormData({
        month,
        label: 'テスト項目',
        amount: 100,
        person: 'husband',
      }))

      expect(result).toEqual({ success: false, error: '月形式が不正です' })
      expect(api).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })
})
