import type { Income, Expense, Carryover } from '@/types'
import type { PaymentRecord, PaymentStatus } from '@/types/payment-status'
import { calculateSettlement } from './calculation'

export interface PaymentEntries {
  incomes: Income[]
  expenses: Expense[]
  carryovers: Carryover[]
}

function assertSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error('金額が安全に計算できる範囲を超えています')
  }
  return value
}

function sumSafeIntegers(values: number[]): number {
  return values.reduce((total, value) => assertSafeInteger(total + assertSafeInteger(value)), 0)
}

/** 現在の明細と取り消されていない実支払から、表示状態を導出する。 */
export function buildPaymentStatus(
  month: string,
  revision: number,
  entries: PaymentEntries,
  payments: PaymentRecord[]
): PaymentStatus {
  const { incomes, expenses, carryovers } = entries
  // 既存計算と同じ順番の途中和まで確認し、丸め前の精度喪失を防ぐ。
  const settlementExpenses = [
    ...expenses.filter(expense => !expense.isCarryover),
    ...carryovers.filter(carryover => carryover.isCleared),
  ]
  const totalIncome = sumSafeIntegers(incomes.map(income => income.amount))
  const totalExpense = sumSafeIntegers(settlementExpenses.map(expense => expense.amount))
  const personalTotals = (['husband', 'wife'] as const).map(person => {
    const personalIncome = sumSafeIntegers(
      incomes.filter(income => income.person === person).map(income => income.amount)
    )
    const personalExpense = sumSafeIntegers(
      settlementExpenses.filter(expense => expense.person === person).map(expense => expense.amount)
    )
    return assertSafeInteger(personalIncome + personalExpense)
  })
  assertSafeInteger(totalIncome + totalExpense)
  assertSafeInteger(personalTotals[0] + personalTotals[1])
  const balanceDifference = assertSafeInteger(personalTotals[0] - personalTotals[1])
  const calculation = calculateSettlement(incomes, expenses, carryovers)
  if (calculation.settlement !== balanceDifference / 2) {
    throw new Error('精算額の計算精度を確認できません')
  }

  const targetSignedYen = Math.trunc(calculation.settlement) || 0
  const activePayments = payments.filter(payment => payment.voidedAt === null)
  // 正負の振込が混在しても履歴の表示順に依存せず、正確な合計を得る。
  const netPaid = activePayments.reduce(
    (total, payment) => total + BigInt(assertSafeInteger(payment.signedYen)),
    BigInt(0)
  )
  const netPaidSignedYen = assertSafeInteger(Number(netPaid))
  const remainingSignedYen = assertSafeInteger(targetSignedYen - netPaidSignedYen)
  const state = activePayments.length > 0
    ? remainingSignedYen === 0 ? 'paid' : 'difference'
    : remainingSignedYen === 0 ? 'unnecessary' : 'unpaid'

  return {
    month,
    revision,
    calculation,
    targetSignedYen,
    netPaidSignedYen,
    remainingSignedYen,
    state,
    payments,
  }
}
