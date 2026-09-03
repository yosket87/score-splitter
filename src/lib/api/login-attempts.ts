import { z } from 'zod'
import {
  checkLoginRateLimit as checkLoginRateLimitInD1,
  recordFailedLoginAttempt as recordFailedLoginAttemptInD1,
  resetLoginAttempts as resetLoginAttemptsInD1,
} from '../../../cloudflare/worker/src/login-attempts'
import {
  getDatabase,
  getRuntime,
  isWorkerApiMockEnabled,
  runD1Operation,
} from './backend'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'

export interface LoginRateLimitStatus {
  allowed: boolean
  retryAfterSeconds?: number
}

const loginRateLimitStatusSchema: z.ZodType<LoginRateLimitStatus> = z.object({
  allowed: z.boolean(),
  retryAfterSeconds: z.number().optional(),
})

const loginRateLimitStatusEnvelopeSchema = apiEnvelopeSchema(loginRateLimitStatusSchema)

export async function checkLoginRateLimit(
  key: string
): Promise<LoginRateLimitStatus> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() => checkLoginRateLimitInD1(getDatabase(), getRuntime(), { key }))
  }

  const response = await apiRequest<ApiEnvelope<LoginRateLimitStatus>>(
    '/login-attempts/check',
    {
      method: 'POST',
      body: { key },
      responseSchema: loginRateLimitStatusEnvelopeSchema,
    }
  )
  return response.data
}

export async function recordFailedLoginAttempt(
  key: string
): Promise<LoginRateLimitStatus> {
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() =>
      recordFailedLoginAttemptInD1(getDatabase(), getRuntime(), { key })
    )
  }

  const response = await apiRequest<ApiEnvelope<LoginRateLimitStatus>>(
    '/login-attempts/failure',
    {
      method: 'POST',
      body: { key },
      responseSchema: loginRateLimitStatusEnvelopeSchema,
    }
  )
  return response.data
}

export async function resetLoginAttempts(key: string): Promise<void> {
  if (!isWorkerApiMockEnabled()) {
    await runD1Operation(() => resetLoginAttemptsInD1(getDatabase(), { key }))
    return
  }

  await apiRequest('/login-attempts/reset', {
    method: 'POST',
    body: { key },
  })
}
