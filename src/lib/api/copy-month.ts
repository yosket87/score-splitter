import 'server-only'
import { assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { householdSessionToken } from './household-session'
import { z } from 'zod'
import { getDatabase, getRuntime, isWorkerApiMockEnabled, runD1Operation } from './backend'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import {
  copyMonthData as copyMonthDataInD1,
  getCopyMonthPreview as getCopyMonthPreviewFromD1,
} from '../../../cloudflare/worker/src/copy-month'
import { parseMonth } from '../../../cloudflare/worker/src/validation'
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
  carryoverFingerprint: z.string(),
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
  context: HouseholdContext,
  sourceMonth: string,
  targetMonth: string
): Promise<CopyMonthPreview> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() =>
      getCopyMonthPreviewFromD1(
        getDatabase(),
        context,
        parseMonth(sourceMonth),
        parseMonth(targetMonth)
      )
    )
  }

  const params = new URLSearchParams({ sourceMonth, targetMonth })
  const response = await apiRequest<ApiEnvelope<CopyMonthPreview>>(`/copy-month/preview?${params}`, {
    responseSchema: copyMonthPreviewEnvelopeSchema,
    sessionToken: await householdSessionToken(context),
  })
  return response.data
}

export async function copyMonthData(context: HouseholdContext, options: CopyMonthOptions): Promise<CopyMonthResult> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => copyMonthDataInD1(getDatabase(), getRuntime(), context, options))
  }

  return apiRequest<CopyMonthResult>('/copy-month', {
    method: 'POST',
    sessionToken: await householdSessionToken(context),
    body: options,
    responseSchema: copyMonthResultSchema,
  })
}
