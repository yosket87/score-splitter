import { z } from 'zod'
import {
  createSession as createSessionInD1,
  deleteSession as deleteSessionInD1,
  getSession as getSessionInD1,
} from '../../../cloudflare/worker/src/sessions'
import {
  getDatabase,
  getRuntime,
  isWorkerApiMockEnabled,
  runD1Operation,
} from './backend'
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
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => createSessionInD1(getDatabase(), getRuntime(), input))
  }

  const response = await apiRequest<ApiEnvelope<ApiSession>>('/sessions', {
    method: 'POST',
    body: input,
    responseSchema: sessionEnvelopeSchema,
  })
  return response.data
}

export async function getSession(token: string): Promise<ApiSession | null> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => getSessionInD1(getDatabase(), token))
  }

  const response = await apiRequest<ApiEnvelope<ApiSession | null>>(
    `/sessions/${encodeURIComponent(token)}`,
    { responseSchema: nullableSessionEnvelopeSchema }
  )
  return response.data
}

export async function deleteSession(token: string): Promise<void> {
  if (!isWorkerApiMockEnabled()) {
    await runD1Operation(() => deleteSessionInD1(getDatabase(), token))
    return
  }

  await apiRequest(`/sessions/${encodeURIComponent(token)}`, { method: 'DELETE' })
}
