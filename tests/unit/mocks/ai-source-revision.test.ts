import { beforeEach, describe, expect, it } from 'vitest'

import {
  deleteRows,
  getTable,
  initStore,
  insertRows,
  updateRows,
} from '@/mocks/db'

function revision(): number {
  return Number(getTable('ai_diagnosis_source_revision')[0]?.revision)
}

describe('MSW AI診断source revision', () => {
  beforeEach(() => initStore())

  it('診断入力に影響するCRUDだけrevisionを増やす', () => {
    const incomeId = String(getTable('incomes')[0]?.id)
    const expenseId = String(getTable('expenses')[0]?.id)

    updateRows('incomes', { id: `eq.${incomeId}` }, { label: '表示名だけ変更' })
    updateRows('expenses', { id: `eq.${expenseId}` }, {
      person: 'wife',
      ai_category: 'dining',
    })
    expect(revision()).toBe(0)

    updateRows('incomes', { id: `eq.${incomeId}` }, { amount: 1 })
    updateRows('expenses', { id: `eq.${expenseId}` }, { label: '診断対象変更' })
    insertRows('carryovers', [{ month: '202604', amount: -1, is_cleared: false }])
    deleteRows('carryovers', { month: 'eq.202604' })

    expect(revision()).toBe(4)
  })
})
