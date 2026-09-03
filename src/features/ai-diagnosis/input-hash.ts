import type { DiagnosisContext } from './domain'

export async function createDiagnosisInputHash(context: DiagnosisContext): Promise<string> {
  const normalizedInput = JSON.stringify({
    targetMonth: context.targetMonth,
    incomes: context.incomes
      .map((income) => ({ type: 'income', month: income.month, amount: income.amount }))
      .sort(sortSerializedItems),
    expenses: context.expenses
      .map((expense) => ({
        type: 'expense', id: expense.id, month: expense.month, label: expense.label,
        amount: expense.amount, isCarryover: expense.isCarryover, aiCategory: expense.aiCategory,
      }))
      .sort(sortSerializedItems),
    carryovers: context.carryovers
      .map((carryover) => ({ type: 'carryover', month: carryover.month, amount: carryover.amount, isCleared: carryover.isCleared }))
      .sort(sortSerializedItems),
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedInput))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sortSerializedItems(left: object, right: object): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}
