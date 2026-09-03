import { describe, expect, it } from 'vitest'
import { expenseCategoryAssignmentSchema } from '@/features/ai-diagnosis/domain'

describe('AI家計診断ドメイン契約', () => {
  it('支出カテゴリ分類にexpectedLabelを必須とし、未知キーを拒否する', () => {
    const assignment = {
      expenseIds: ['expense-1'],
      category: 'dining',
      expectedLabel: '外食',
    }

    expect(expenseCategoryAssignmentSchema.parse(assignment)).toEqual(assignment)
    expect(
      expenseCategoryAssignmentSchema.safeParse({
        expenseIds: ['expense-1'],
        category: 'dining',
      }).success
    ).toBe(false)
    expect(
      expenseCategoryAssignmentSchema.safeParse({ ...assignment, person: 'husband' }).success
    ).toBe(false)
  })
})
