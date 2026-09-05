import 'server-only'
import { z } from 'zod'
import { getLegacyHouseholdContext as getLegacyInD1, assertExistingLoginHousehold as assertExistingInD1, assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { getDatabase, isWorkerApiMockEnabled, runD1Operation } from './backend'
import { apiRequest, ApiError } from './client'
import { apiEnvelopeSchema } from './types'

export async function getLegacyHouseholdContext(): Promise<HouseholdContext> {
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => getLegacyInD1(getDatabase()))
  const response = await apiRequest('/internal/auth/legacy-household', {
    responseSchema: apiEnvelopeSchema(z.object({ householdId: z.string().min(1) })),
  })
  return Object.freeze(response.data)
}

export async function assertExistingLoginHousehold(context: HouseholdContext): Promise<void> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => assertExistingInD1(getDatabase(), context))
  const legacy = await getLegacyHouseholdContext()
  if (legacy.householdId !== context.householdId) throw new ApiError('この世帯ではログインできません', 401)
}
