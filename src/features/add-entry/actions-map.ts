import { createCarryover } from '@/app/actions/carryover'
import { createExpense } from '@/app/actions/expense'
import { createIncome } from '@/app/actions/income'

export const createActions = {
  income: createIncome,
  expense: createExpense,
  carryover: createCarryover,
}
