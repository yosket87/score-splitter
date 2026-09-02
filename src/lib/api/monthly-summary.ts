import { z } from 'zod'
import { getDatabase, isWorkerApiMockEnabled, runD1Operation } from './backend'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import { listMonthlyAmounts } from '../../../cloudflare/worker/src/records'
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
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => listMonthlyAmounts(getDatabase()))
  }

  const response = await apiRequest<
    ApiEnvelope<{ incomes: MonthlyAmountRow[]; expenses: MonthlyAmountRow[] }>
  >('/monthly-amounts', { responseSchema: monthlyAmountsEnvelopeSchema })
  return response.data
}
