import 'server-only'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createChallenge as createChallengeInD1, consumeChallenge as consumeChallengeInD1, deleteExpiredChallenges as deleteExpiredChallengesInD1, type ChallengeScope } from '../../../cloudflare/worker/src/challenges'
import * as passkeys from '../../../cloudflare/worker/src/passkeys'
import { assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { getDatabase, getRuntime, isWorkerApiMockEnabled, runD1Operation } from './backend'
import { apiRequest, ApiError } from './client'
import { apiEnvelopeSchema } from './types'
import { getSession } from './sessions'
import type { Person } from '@/types'

const passkeySchema = z.object({
  id: z.string(), householdId: z.string().min(1), person: z.enum(['husband', 'wife']),
  publicKeyBase64: z.string(), counter: z.number(), deviceName: z.string().nullable(),
  transports: z.array(z.string()), createdAt: z.string(),
})
const challengeSchema = z.object({
  id: z.string(), householdId: z.string().nullable(), challenge: z.string(),
  type: z.enum(['registration', 'authentication']), person: z.enum(['husband', 'wife']).nullable(),
  expiresAt: z.string(), createdAt: z.string(),
})
export type ApiPasskey = z.infer<typeof passkeySchema>
export type ApiChallenge = z.infer<typeof challengeSchema>
export type { ChallengeScope }

// モックHTTPでも所属payloadを信用せずDB sessionを管理ルートへ渡す。
async function managementToken(context: HouseholdContext): Promise<string> {
  assertHouseholdContext(context)
  const token = (await cookies()).get('household_session')?.value
  const session = token ? await getSession(token) : null
  if (!session || session.householdId !== context.householdId) throw new ApiError('認証が必要です', 401)
  return token!
}

export async function listPasskeys(context: HouseholdContext, person?: Person): Promise<ApiPasskey[]> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => passkeys.listPasskeys(getDatabase(), context, person))
  const response = await apiRequest(person ? `/passkeys?person=${person}` : '/passkeys', {
    sessionToken: await managementToken(context), responseSchema: apiEnvelopeSchema(z.array(passkeySchema)),
  })
  return response.data
}

export async function getPasskey(context: HouseholdContext, id: string): Promise<ApiPasskey | null> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => passkeys.getPasskey(getDatabase(), context, id))
  return (await apiRequest(`/passkeys/${encodeURIComponent(id)}`, {
    sessionToken: await managementToken(context), responseSchema: apiEnvelopeSchema(passkeySchema.nullable()),
  })).data
}

export async function findAuthenticationCredential(id: string): Promise<ApiPasskey | null> {
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => passkeys.findAuthenticationCredential(getDatabase(), id))
  return (await apiRequest(`/internal/auth/credentials/${encodeURIComponent(id)}`, {
    responseSchema: apiEnvelopeSchema(passkeySchema.nullable()),
  })).data
}

export async function createPasskey(context: HouseholdContext, input: {
  id: string; person: Person; publicKeyBase64: string; counter: number; deviceName: string | null; transports: string[]
}): Promise<ApiPasskey> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => passkeys.createPasskey(getDatabase(), getRuntime(), context, input))
  return (await apiRequest('/passkeys', {
    method: 'POST', body: input, sessionToken: await managementToken(context), responseSchema: apiEnvelopeSchema(passkeySchema),
  })).data
}

// 署名検証成功後に限って、検証済みcredentialの所属とIDを渡す内部経路。
export async function updatePasskeyCounter(context: HouseholdContext, id: string, counter: number): Promise<void> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => passkeys.updatePasskeyCounter(getDatabase(), context, id, { counter }))
  await apiRequest(`/internal/auth/credentials/${encodeURIComponent(id)}`, { method: 'PATCH', body: { householdId: context.householdId, counter } })
}

export async function deletePasskey(context: HouseholdContext, id: string): Promise<void> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => passkeys.deletePasskey(getDatabase(), context, id))
  await apiRequest(`/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE', sessionToken: await managementToken(context) })
}

function challengePath(scope: ChallengeScope): string {
  return scope.type === 'registration' ? '/webauthn-challenges' : '/internal/auth/challenges'
}

export async function createChallenge(scope: ChallengeScope, input: {
  challenge: string; person: Person | null; expiresAt: string
}): Promise<ApiChallenge> {
  if (scope.type === 'registration') assertHouseholdContext(scope.context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => createChallengeInD1(getDatabase(), getRuntime(), scope, input))
  return (await apiRequest(challengePath(scope), {
    method: 'POST', body: input, responseSchema: apiEnvelopeSchema(challengeSchema),
    ...(scope.type === 'registration' ? { sessionToken: await managementToken(scope.context) } : {}),
  })).data
}

export async function consumeChallenge(scope: ChallengeScope, id: string, person: Person | null): Promise<ApiChallenge | null> {
  if (scope.type === 'registration') assertHouseholdContext(scope.context)
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => consumeChallengeInD1(getDatabase(), getRuntime(), scope, id, person))
  return (await apiRequest(`${challengePath(scope)}/${encodeURIComponent(id)}/consume`, {
    method: 'POST', body: { person }, responseSchema: apiEnvelopeSchema(challengeSchema.nullable()),
    ...(scope.type === 'registration' ? { sessionToken: await managementToken(scope.context) } : {}),
  })).data
}

export async function deleteExpiredChallenges(before: string): Promise<void> {
  if (!isWorkerApiMockEnabled()) return runD1Operation(() => deleteExpiredChallengesInD1(getDatabase(), before))
  await apiRequest('/internal/auth/challenges/expired', { method: 'DELETE', body: { before } })
}
