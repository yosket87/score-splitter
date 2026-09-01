import { z } from 'zod'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import type { MonthlyAmountRow } from '@/types'

const monthlyAmountRowSchema: z.ZodType<MonthlyAmountRow> = z.object({
  month: z.string(),
  amount: z.number(),
})

const monthlyAmountsSchema = z.object({
  incomes: z.array(monthlyAmountRowSchema),
  expenses: z.array(monthlyAmountRowSchema),
})

const monthlyAmountsEnvelopeSchema = apiEnvelopeSchema(monthlyAmountsSchema)

export async function getMonthlyAmounts(): Promise<{
  incomes: MonthlyAmountRow[]
  expenses: MonthlyAmountRow[]
}> {
  const response = await apiRequest<
    ApiEnvelope<{ incomes: MonthlyAmountRow[]; expenses: MonthlyAmountRow[] }>
  >('/monthly-amounts', { responseSchema: monthlyAmountsEnvelopeSchema })
  return response.data
}
