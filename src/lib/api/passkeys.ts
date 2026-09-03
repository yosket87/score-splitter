import { z } from 'zod'
import {
  createChallenge as createChallengeInD1,
  deleteChallenges as deleteChallengesInD1,
  deleteExpiredChallenges as deleteExpiredChallengesInD1,
  getLatestChallenge as getLatestChallengeInD1,
  parseChallengeType,
} from '../../../cloudflare/worker/src/challenges'
import {
  createPasskey as createPasskeyInD1,
  deletePasskey as deletePasskeyInD1,
  getPasskey as getPasskeyInD1,
  listPasskeys as listPasskeysInD1,
  updatePasskeyCounter as updatePasskeyCounterInD1,
} from '../../../cloudflare/worker/src/passkeys'
import {
  getDatabase,
  getRuntime,
  isWorkerApiMockEnabled,
  runD1Operation,
} from './backend'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import type { Person } from '@/types'

export interface ApiPasskey {
  id: string
  person: Person
  publicKeyBase64: string
  counter: number
  deviceName: string | null
  transports: string[]
  createdAt: string
}

export interface ApiChallenge {
  id: string
  challenge: string
  type: 'registration' | 'authentication'
  person: Person | null
  expiresAt: string
  createdAt: string
}

const personSchema = z.enum(['husband', 'wife'])

const passkeySchema: z.ZodType<ApiPasskey> = z.object({
  id: z.string(),
  person: personSchema,
  publicKeyBase64: z.string(),
  counter: z.number(),
  deviceName: z.string().nullable(),
  transports: z.array(z.string()),
  createdAt: z.string(),
})

const challengeSchema: z.ZodType<ApiChallenge> = z.object({
  id: z.string(),
  challenge: z.string(),
  type: z.enum(['registration', 'authentication']),
  person: personSchema.nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
})

const passkeyEnvelopeSchema = apiEnvelopeSchema(passkeySchema)
const passkeyListEnvelopeSchema = apiEnvelopeSchema(z.array(passkeySchema))
const nullablePasskeyEnvelopeSchema = apiEnvelopeSchema(passkeySchema.nullable())
const challengeEnvelopeSchema = apiEnvelopeSchema(challengeSchema)
const nullableChallengeEnvelopeSchema = apiEnvelopeSchema(challengeSchema.nullable())

export async function listPasskeys(person?: Person): Promise<ApiPasskey[]> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => listPasskeysInD1(getDatabase(), person))
  }

  const path = person ? `/passkeys?person=${encodeURIComponent(person)}` : '/passkeys'
  const response = await apiRequest<ApiEnvelope<ApiPasskey[]>>(path, {
    responseSchema: passkeyListEnvelopeSchema,
  })
  return response.data
}

export async function getPasskey(id: string): Promise<ApiPasskey | null> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => getPasskeyInD1(getDatabase(), id))
  }

  const response = await apiRequest<ApiEnvelope<ApiPasskey | null>>(
    `/passkeys/${encodeURIComponent(id)}`,
    { responseSchema: nullablePasskeyEnvelopeSchema }
  )
  return response.data
}

export async function createPasskey(input: {
  id: string
  person: Person
  publicKeyBase64: string
  counter: number
  deviceName: string | null
  transports: string[]
}): Promise<ApiPasskey> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => createPasskeyInD1(getDatabase(), getRuntime(), input))
  }

  const response = await apiRequest<ApiEnvelope<ApiPasskey>>('/passkeys', {
    method: 'POST',
    body: input,
    responseSchema: passkeyEnvelopeSchema,
  })
  return response.data
}

export async function updatePasskeyCounter(id: string, counter: number): Promise<void> {
  if (!isWorkerApiMockEnabled()) {
    await runD1Operation(() => updatePasskeyCounterInD1(getDatabase(), id, { counter }))
    return
  }

  await apiRequest(`/passkeys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { counter },
  })
}

export async function deletePasskey(id: string): Promise<void> {
  if (!isWorkerApiMockEnabled()) {
    await runD1Operation(() => deletePasskeyInD1(getDatabase(), id))
    return
  }

  await apiRequest(`/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createChallenge(input: {
  challenge: string
  type: 'registration' | 'authentication'
  person: Person | null
  expiresAt: string
}): Promise<ApiChallenge> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => createChallengeInD1(getDatabase(), getRuntime(), input))
  }

  const response = await apiRequest<ApiEnvelope<ApiChallenge>>('/webauthn-challenges', {
    method: 'POST',
    body: input,
    responseSchema: challengeEnvelopeSchema,
  })
  return response.data
}

export async function getLatestChallenge(input: {
  type: 'registration' | 'authentication'
  person: Person | null
}): Promise<ApiChallenge | null> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() =>
      getLatestChallengeInD1(getDatabase(), parseChallengeType(input.type), input.person)
    )
  }

  const params = new URLSearchParams({ type: input.type })
  if (input.person) {
    params.set('person', input.person)
  }
  const response = await apiRequest<ApiEnvelope<ApiChallenge | null>>(
    `/webauthn-challenges/latest?${params}`,
    { responseSchema: nullableChallengeEnvelopeSchema }
  )
  return response.data
}

export async function deleteChallenges(input: {
  type: 'registration' | 'authentication'
  person: Person | null
}): Promise<void> {
  if (!isWorkerApiMockEnabled()) {
    await runD1Operation(() =>
      deleteChallengesInD1(getDatabase(), parseChallengeType(input.type), input.person)
    )
    return
  }

  const params = new URLSearchParams({ type: input.type })
  if (input.person) {
    params.set('person', input.person)
  }
  await apiRequest(`/webauthn-challenges?${params}`, { method: 'DELETE' })
}

export async function deleteExpiredChallenges(before: string): Promise<void> {
  if (!isWorkerApiMockEnabled()) {
    await runD1Operation(() => deleteExpiredChallengesInD1(getDatabase(), before))
    return
  }

  const params = new URLSearchParams({ before })
  await apiRequest(`/webauthn-challenges/expired?${params}`, { method: 'DELETE' })
}
