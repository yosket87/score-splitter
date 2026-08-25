import { z } from 'zod'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import type { Person } from '@/types'

export interface ApiSession {
  token: string
  person: Person | null
  authMethod: 'password' | 'passkey'
  expiresAt: string
}

const sessionSchema: z.ZodType<ApiSession> = z.object({
  token: z.string(),
  person: z.enum(['husband', 'wife']).nullable(),
  authMethod: z.enum(['password', 'passkey']),
  expiresAt: z.string(),
})

const sessionEnvelopeSchema = apiEnvelopeSchema(sessionSchema)
const nullableSessionEnvelopeSchema = apiEnvelopeSchema(sessionSchema.nullable())

export async function createSession(input: {
  token: string
  person: Person | null
  authMethod: 'password' | 'passkey'
  expiresAt: string
}): Promise<ApiSession> {
  const response = await apiRequest<ApiEnvelope<ApiSession>>('/sessions', {
    method: 'POST',
    body: input,
    responseSchema: sessionEnvelopeSchema,
  })
  return response.data
}

export async function getSession(token: string): Promise<ApiSession | null> {
  const response = await apiRequest<ApiEnvelope<ApiSession | null>>(
    `/sessions/${encodeURIComponent(token)}`,
    { responseSchema: nullableSessionEnvelopeSchema }
  )
  return response.data
}

export async function deleteSession(token: string): Promise<void> {
  await apiRequest(`/sessions/${encodeURIComponent(token)}`, { method: 'DELETE' })
}
