import type { Income, Expense, Carryover, Person } from '@/types'
import {
  calculateSettlement,
  filterActualExpenses,
  filterCarryoverExpenses,
  filterClearedCarryovers,
  getSettlementDirectionLabel,
} from '@/lib/utils/calculation'
import { PERSON_LABELS } from '@/lib/constants'
import { formatMonth } from '@/lib/utils/format'

const BOM = '\uFEFF'

function personLabel(person: Person): string {
  return PERSON_LABELS[person]
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function generateMonthlyCsv(
  month: string,
  incomes: Income[],
  expenses: Expense[],
  carryovers: Carryover[]
): string {
  const result = calculateSettlement(incomes, expenses, carryovers)
  const actualExpenses = filterActualExpenses(expenses)
  const carryoverExpenses = filterCarryoverExpenses(expenses)
  const clearedCarryovers = filterClearedCarryovers(carryovers)
  const unclearedCarryovers = carryovers.filter((c) => !c.isCleared)

  const actualExpenseTotal = actualExpenses.reduce((sum, e) => sum + e.amount, 0)
  const monthlyBalance = result.totalIncome + actualExpenseTotal
  const carryoverExpenseTotal = carryoverExpenses.reduce((sum, e) => sum + e.amount, 0)
  const clearedCarryoverTotal = clearedCarryovers.reduce((sum, c) => sum + c.amount, 0)

  const lines: string[] = []

  // ヘッダー
  lines.push(`家計データ,${formatMonth(month)}`)
  lines.push('')

  // 月の実績セクション
  lines.push('■ 月の実績')
  lines.push('項目,金額')
  lines.push(`収入合計,${result.totalIncome}`)
  lines.push(`支出合計（実績）,${Math.abs(actualExpenseTotal)}`)
  lines.push(`月の収支,${monthlyBalance}`)
  lines.push('')

  // 調整セクション（調整がある場合のみ）
  if (carryoverExpenses.length > 0 || clearedCarryovers.length > 0) {
    lines.push('■ 調整')
    lines.push('項目,金額')
    if (carryoverExpenses.length > 0) {
      lines.push(`繰越に回した支出,${Math.abs(carryoverExpenseTotal)}`)
    }
    if (clearedCarryovers.length > 0) {
      lines.push(`清算した繰越,${Math.abs(clearedCarryoverTotal)}`)
    }
    lines.push(`調整後の収支,${monthlyBalance + carryoverExpenseTotal + clearedCarryoverTotal}`)
    lines.push('')
  }

  // 精算セクション
  lines.push('■ 精算')
  lines.push('項目,金額')
  lines.push(`夫の収入,${result.husbandIncome}`)
  lines.push(`妻の収入,${result.wifeIncome}`)
  lines.push(`夫の支出,${Math.abs(result.husbandExpense)}`)
  lines.push(`妻の支出,${Math.abs(result.wifeExpense)}`)
  lines.push(`お小遣い（1人あたり）,${result.allowance}`)
  lines.push(`精算額,${Math.abs(result.settlement)}`)
  lines.push(`精算方向,${getSettlementDirectionLabel(result.settlement)}`)
  lines.push('')

  // 収入セクション
  lines.push('■ 収入')
  lines.push('担当,項目名,金額')
  for (const income of incomes) {
    lines.push(`${personLabel(income.person)},${escapeCsvField(income.label)},${income.amount}`)
  }
  lines.push('')

  // 支出セクション（実績）
  lines.push('■ 支出（実績）')
  lines.push('担当,項目名,金額')
  for (const expense of actualExpenses) {
    lines.push(`${personLabel(expense.person)},${escapeCsvField(expense.label)},${Math.abs(expense.amount)}`)
  }
  lines.push('')

  // 支出セクション（繰越扱い）
  if (carryoverExpenses.length > 0) {
    lines.push('■ 支出（繰越扱い）')
    lines.push('担当,項目名,金額')
    for (const expense of carryoverExpenses) {
      lines.push(`${personLabel(expense.person)},${escapeCsvField(expense.label)},${Math.abs(expense.amount)}`)
    }
    lines.push('')
  }

  // 繰越セクション（未清算）
  if (unclearedCarryovers.length > 0) {
    lines.push('■ 繰越（未清算）')
    lines.push('担当,項目名,金額')
    for (const carryover of unclearedCarryovers) {
      lines.push(`${personLabel(carryover.person)},${escapeCsvField(carryover.label)},${Math.abs(carryover.amount)}`)
    }
    lines.push('')
  }

  // 繰越セクション（清算済み）
  if (clearedCarryovers.length > 0) {
    lines.push('■ 繰越（清算済み）')
    lines.push('担当,項目名,金額')
    for (const carryover of clearedCarryovers) {
      lines.push(`${personLabel(carryover.person)},${escapeCsvField(carryover.label)},${Math.abs(carryover.amount)}`)
    }
  }

  return BOM + lines.join('\n')
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
