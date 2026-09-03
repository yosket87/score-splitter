import { describe, expect, it } from 'vitest'
import { createDiagnosisInputHash } from '@/features/ai-diagnosis/input-hash'
import type { DiagnosisContext } from '@/features/ai-diagnosis/domain'

const context: DiagnosisContext = {
  targetMonth: '202604',
  sourceRevision: 1,
  incomes: [{ month: '202604', amount: 600000 }],
  expenses: [{ id: 'apr-dining', month: '202604', label: '外食', amount: -48000, isCarryover: false, aiCategory: 'dining' }],
  carryovers: [{ month: '202604', amount: -10000, isCleared: false }],
}

describe('createDiagnosisInputHash', () => {
  it('配列順と担当者に依存せず、金額とカテゴリの変更を検出する', async () => {
    const first = await createDiagnosisInputHash(context)
    const reordered = await createDiagnosisInputHash({ ...context, expenses: [...context.expenses].reverse() })
    const changed = await createDiagnosisInputHash({
      ...context,
      expenses: context.expenses.map((expense) => expense.id === 'apr-dining' ? { ...expense, amount: -49000 } : expense),
    })
    expect(reordered).toBe(first)
    expect(changed).not.toBe(first)
  })
})
