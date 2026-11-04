import 'server-only'
import { z } from 'zod'
import { getLegacyHouseholdContext as getLegacyInD1, assertExistingLoginHousehold as assertExistingInD1, isLegacyAuthEnabled as enabledInD1, assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
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

export async function isLegacyAuthEnabled(context?: HouseholdContext): Promise<boolean> {
  if (context) assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => enabledInD1(getDatabase(), context))
  const { getTable } = await import('@/mocks/db')
  const row = getTable('households').find(row => context ? row.id === context.householdId : row.legacy_auth_key === 'legacy')
  return !!row && row.legacy_auth_disabled_at == null
}
export async function assertLegacyAuthEnabled(context?: HouseholdContext): Promise<void> {
  if (!await isLegacyAuthEnabled(context)) throw new ApiError('これまでのログイン方法は終了しました。Googleでログインしてください。', 401)
}
