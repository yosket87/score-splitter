import type { Income, Expense, Carryover, CalculationResult } from '@/types'

/**
 * 収入と支出から精算額を計算する
 *
 * 計算ロジック:
 * 1. 精算対象の支出 = 非繰越支出 + 清算済み繰越
 * 2. 収入合計 = SUM(全収入)
 * 3. 支出合計 = SUM(精算対象の支出)（負の値）
 * 4. お小遣い = (収入合計 + 支出合計) / 2
 * 5. 精算額 = 夫の合計 - お小遣い
 *    - 正の値: 夫が妻に支払う
 *    - 負の値: 妻が夫に支払う
 */
export function calculateSettlement(
  incomes: Income[],
  expenses: Expense[],
  carryovers: Carryover[] = []
): CalculationResult {
  // 精算対象の支出: 非繰越支出 + 清算済み繰越
  const actualExpenses = filterActualExpenses(expenses)
  const clearedCarryovers = filterClearedCarryovers(carryovers)
  const settlementExpenses = [
    ...actualExpenses,
    ...clearedCarryovers.map((c) => ({
      id: c.id,
      month: c.month,
      label: c.label,
      amount: c.amount,
      person: c.person,
      isCarryover: false,
    })),
  ]

  // 収入合計
  const totalIncome = incomes.reduce((sum, income) => sum + income.amount, 0)

  // 支出合計（負の値）
  const totalExpense = settlementExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  // 担当者別収入
  const husbandIncome = incomes
    .filter((i) => i.person === 'husband')
    .reduce((sum, i) => sum + i.amount, 0)

  const wifeIncome = incomes
    .filter((i) => i.person === 'wife')
    .reduce((sum, i) => sum + i.amount, 0)

  // 担当者別支出（負の値）
  const husbandExpense = settlementExpenses
    .filter((e) => e.person === 'husband')
    .reduce((sum, e) => sum + e.amount, 0)

  const wifeExpense = settlementExpenses
    .filter((e) => e.person === 'wife')
    .reduce((sum, e) => sum + e.amount, 0)

  // 担当者別合計
  const husbandTotal = husbandIncome + husbandExpense
  const wifeTotal = wifeIncome + wifeExpense

  // お小遣い = (収入合計 + 支出合計) / 2
  const allowance = (totalIncome + totalExpense) / 2

  // 精算額 = 夫の合計 - お小遣い
  const settlement = husbandTotal - allowance

  return {
    totalIncome,
    totalExpense,
    husbandIncome,
    wifeIncome,
    husbandExpense,
    wifeExpense,
    husbandTotal,
    wifeTotal,
    allowance,
    settlement,
  }
}

/** 非繰越支出のみ（実績） */
export function filterActualExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.isCarryover)
}

/** 繰越フラグ付き支出のみ */
export function filterCarryoverExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => e.isCarryover)
}

/** 清算済み繰越のみ */
export function filterClearedCarryovers(carryovers: Carryover[]): Carryover[] {
  return carryovers.filter((c) => c.isCleared)
}

/** 精算方向の表示ラベル。正（0含む）は夫から妻、負は妻から夫。 */
export function getSettlementDirectionLabel(
  settlement: number
): '夫 → 妻' | '妻 → 夫' {
  return settlement >= 0 ? '夫 → 妻' : '妻 → 夫'
}
