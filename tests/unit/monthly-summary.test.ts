import { describe, it, expect } from 'vitest'
import {
  calculateMonthBalance,
  aggregateMonthlySummaries,
} from '@/lib/helpers/monthly-summary'
import type { MonthlyAmountRow } from '@/types'

describe('calculateMonthBalance', () => {
  it('空配列ならすべて0を返す', () => {
    expect(calculateMonthBalance([], [])).toEqual({
      incomeTotal: 0,
      expenseTotal: 0,
      balance: 0,
    })
  })

  it('収入のみの場合はincomeTotalとbalanceが同じになる', () => {
    const incomes: MonthlyAmountRow[] = [
      { month: '202604', amount: 300000 },
      { month: '202604', amount: 200000 },
    ]
    expect(calculateMonthBalance(incomes, [])).toEqual({
      incomeTotal: 500000,
      expenseTotal: 0,
      balance: 500000,
    })
  })

  it('支出のみの場合はexpenseTotalが負値、balanceも負値になる', () => {
    const expenses: MonthlyAmountRow[] = [
      { month: '202604', amount: -100000 },
      { month: '202604', amount: -50000 },
    ]
    expect(calculateMonthBalance([], expenses)).toEqual({
      incomeTotal: 0,
      expenseTotal: -150000,
      balance: -150000,
    })
  })

  it('収入と支出を合算してbalanceを算出する', () => {
    const incomes: MonthlyAmountRow[] = [{ month: '202604', amount: 500000 }]
    const expenses: MonthlyAmountRow[] = [
      { month: '202604', amount: -200000 },
      { month: '202604', amount: -50000 },
    ]
    expect(calculateMonthBalance(incomes, expenses)).toEqual({
      incomeTotal: 500000,
      expenseTotal: -250000,
      balance: 250000,
    })
  })

  it('入力配列をmutateしない', () => {
    const incomes: MonthlyAmountRow[] = [{ month: '202604', amount: 100 }]
    const expenses: MonthlyAmountRow[] = [{ month: '202604', amount: -50 }]
    const incomesCopy = [...incomes]
    const expensesCopy = [...expenses]
    calculateMonthBalance(incomes, expenses)
    expect(incomes).toEqual(incomesCopy)
    expect(expenses).toEqual(expensesCopy)
  })
})

describe('aggregateMonthlySummaries', () => {
  it('空配列なら空配列を返す', () => {
    expect(aggregateMonthlySummaries([], [])).toEqual([])
  })

  it('単月データなら1件のサマリーを返す', () => {
    const incomes: MonthlyAmountRow[] = [{ month: '202604', amount: 300000 }]
    const expenses: MonthlyAmountRow[] = [{ month: '202604', amount: -100000 }]
    expect(aggregateMonthlySummaries(incomes, expenses)).toEqual([
      {
        month: '202604',
        incomeTotal: 300000,
        expenseTotal: -100000,
        balance: 200000,
      },
    ])
  })

  it('複数月データを月降順で返す', () => {
    const incomes: MonthlyAmountRow[] = [
      { month: '202602', amount: 200000 },
      { month: '202604', amount: 300000 },
      { month: '202603', amount: 250000 },
    ]
    const expenses: MonthlyAmountRow[] = [
      { month: '202602', amount: -50000 },
      { month: '202604', amount: -100000 },
      { month: '202603', amount: -80000 },
    ]
    const result = aggregateMonthlySummaries(incomes, expenses)
    expect(result.map((r) => r.month)).toEqual(['202604', '202603', '202602'])
    expect(result[0].balance).toBe(200000)
    expect(result[1].balance).toBe(170000)
    expect(result[2].balance).toBe(150000)
  })

  it('収入のみの月、支出のみの月が混在しても両方含める', () => {
    const incomes: MonthlyAmountRow[] = [{ month: '202604', amount: 300000 }]
    const expenses: MonthlyAmountRow[] = [{ month: '202603', amount: -100000 }]
    const result = aggregateMonthlySummaries(incomes, expenses)
    expect(result).toEqual([
      { month: '202604', incomeTotal: 300000, expenseTotal: 0, balance: 300000 },
      { month: '202603', incomeTotal: 0, expenseTotal: -100000, balance: -100000 },
    ])
  })

  it('同月内の複数レコードを正しく合算する', () => {
    const incomes: MonthlyAmountRow[] = [
      { month: '202604', amount: 300000 },
      { month: '202604', amount: 200000 },
    ]
    const expenses: MonthlyAmountRow[] = [
      { month: '202604', amount: -100000 },
      { month: '202604', amount: -50000 },
      { month: '202604', amount: -30000 },
    ]
    const result = aggregateMonthlySummaries(incomes, expenses)
    expect(result).toEqual([
      {
        month: '202604',
        incomeTotal: 500000,
        expenseTotal: -180000,
        balance: 320000,
      },
    ])
  })

  it('入力配列をmutateしない', () => {
    const incomes: MonthlyAmountRow[] = [
      { month: '202602', amount: 200000 },
      { month: '202604', amount: 300000 },
    ]
    const expenses: MonthlyAmountRow[] = [{ month: '202604', amount: -100000 }]
    const incomesCopy = [...incomes]
    const expensesCopy = [...expenses]
    aggregateMonthlySummaries(incomes, expenses)
    expect(incomes).toEqual(incomesCopy)
    expect(expenses).toEqual(expensesCopy)
  })
})
