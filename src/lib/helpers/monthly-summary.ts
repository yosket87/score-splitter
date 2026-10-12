import type { MonthlyAmountRow, MonthlySummary } from '@/types'

/**
 * 単月の収支を算出する純粋関数
 * - incomeTotal: 収入合計
 * - expenseTotal: 支出合計（負値のまま）
 * - balance: incomeTotal + expenseTotal
 */
export function calculateMonthBalance(
  incomes: MonthlyAmountRow[],
  expenses: MonthlyAmountRow[]
): Pick<MonthlySummary, 'incomeTotal' | 'expenseTotal' | 'balance'> {
  const incomeTotal = incomes.reduce((sum, r) => sum + r.amount, 0)
  const expenseTotal = expenses.reduce((sum, r) => sum + r.amount, 0)
  return {
    incomeTotal,
    expenseTotal,
    balance: incomeTotal + expenseTotal,
  }
}

/**
 * 複数月のサマリーを月降順で返す純粋関数
 * - 収入のみ・支出のみの月も結果に含まれる
 * - 入力配列はmutateしない
 */
export function aggregateMonthlySummaries(
  incomes: MonthlyAmountRow[],
  expenses: MonthlyAmountRow[]
): MonthlySummary[] {
  const incomeByMonth = new Map<string, MonthlyAmountRow[]>()
  const expenseByMonth = new Map<string, MonthlyAmountRow[]>()

  for (const row of incomes) {
    const list = incomeByMonth.get(row.month) ?? []
    incomeByMonth.set(row.month, [...list, row])
  }
  for (const row of expenses) {
    const list = expenseByMonth.get(row.month) ?? []
    expenseByMonth.set(row.month, [...list, row])
  }

  const months = new Set<string>([...incomeByMonth.keys(), ...expenseByMonth.keys()])

  return Array.from(months)
    .sort((a, b) => b.localeCompare(a))
    .map((month) => {
      const { incomeTotal, expenseTotal, balance } = calculateMonthBalance(
        incomeByMonth.get(month) ?? [],
        expenseByMonth.get(month) ?? []
      )
      return { month, incomeTotal, expenseTotal, balance }
    })
}
