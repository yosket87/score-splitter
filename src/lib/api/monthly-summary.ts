import { apiRequest } from './client'
import type { MonthlyAmountRow } from '@/types'

interface ApiData<T> {
  data: T
}

export async function getMonthlyAmounts(): Promise<{
  incomes: MonthlyAmountRow[]
  expenses: MonthlyAmountRow[]
}> {
  const response = await apiRequest<
    ApiData<{ incomes: MonthlyAmountRow[]; expenses: MonthlyAmountRow[] }>
  >('/monthly-amounts')
  return response.data
}
