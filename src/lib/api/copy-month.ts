import { z } from 'zod'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import type { CopyMonthOptions, CopyMonthPreview, CopyMonthResult } from '@/types'

const copyItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number(),
  person: z.enum(['husband', 'wife']),
  type: z.enum(['income', 'expense']),
})

const copyMonthPreviewSchema: z.ZodType<CopyMonthPreview> = z.object({
  sourceMonth: z.string(),
  targetMonth: z.string(),
  items: z.array(copyItemSchema),
  carryoverCount: z.number(),
  existingCount: z.number(),
})

const copyCountSchema = z.object({
  incomes: z.number(),
  expenses: z.number(),
  carryovers: z.number(),
})

const copyMonthResultSchema: z.ZodType<CopyMonthResult> = z.object({
  success: z.boolean(),
  copied: copyCountSchema,
  skipped: copyCountSchema,
  error: z.string().optional(),
})

const copyMonthPreviewEnvelopeSchema = apiEnvelopeSchema(copyMonthPreviewSchema)

export async function getCopyMonthPreview(
  sourceMonth: string,
  targetMonth: string
): Promise<CopyMonthPreview> {
  const params = new URLSearchParams({ sourceMonth, targetMonth })
  const response = await apiRequest<ApiEnvelope<CopyMonthPreview>>(`/copy-month/preview?${params}`, {
    responseSchema: copyMonthPreviewEnvelopeSchema,
  })
  return response.data
}

export async function copyMonthData(options: CopyMonthOptions): Promise<CopyMonthResult> {
  return apiRequest<CopyMonthResult>('/copy-month', {
    method: 'POST',
    body: options,
    responseSchema: copyMonthResultSchema,
  })
}
