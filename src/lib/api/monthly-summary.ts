import { apiRequest } from './client'
import type { ApiEnvelope } from './types'
import type { MonthlyAmountRow } from '@/types'

export async function getMonthlyAmounts(): Promise<{
  incomes: MonthlyAmountRow[]
  expenses: MonthlyAmountRow[]
}> {
  const response = await apiRequest<
    ApiEnvelope<{ incomes: MonthlyAmountRow[]; expenses: MonthlyAmountRow[] }>
  >('/monthly-amounts')
  return response.data
}
