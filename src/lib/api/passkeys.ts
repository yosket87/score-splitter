import { z } from 'zod'
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
  const path = person ? `/passkeys?person=${encodeURIComponent(person)}` : '/passkeys'
  const response = await apiRequest<ApiEnvelope<ApiPasskey[]>>(path, {
    responseSchema: passkeyListEnvelopeSchema,
  })
  return response.data
}

export async function getPasskey(id: string): Promise<ApiPasskey | null> {
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
  const response = await apiRequest<ApiEnvelope<ApiPasskey>>('/passkeys', {
    method: 'POST',
    body: input,
    responseSchema: passkeyEnvelopeSchema,
  })
  return response.data
}

export async function updatePasskeyCounter(id: string, counter: number): Promise<void> {
  await apiRequest(`/passkeys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { counter },
  })
}

export async function deletePasskey(id: string): Promise<void> {
  await apiRequest(`/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createChallenge(input: {
  challenge: string
  type: 'registration' | 'authentication'
  person: Person | null
  expiresAt: string
}): Promise<ApiChallenge> {
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
  const params = new URLSearchParams({ type: input.type })
  if (input.person) {
    params.set('person', input.person)
  }
  await apiRequest(`/webauthn-challenges?${params}`, { method: 'DELETE' })
}

export async function deleteExpiredChallenges(before: string): Promise<void> {
  const params = new URLSearchParams({ before })
  await apiRequest(`/webauthn-challenges/expired?${params}`, { method: 'DELETE' })
}
