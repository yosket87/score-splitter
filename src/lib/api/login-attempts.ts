import { z } from 'zod'
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
  await apiRequest('/login-attempts/reset', {
    method: 'POST',
    body: { key },
  })
}
