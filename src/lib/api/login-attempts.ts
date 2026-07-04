import { apiRequest } from './client'
import type { ApiEnvelope } from './types'

export interface LoginRateLimitStatus {
  allowed: boolean
  retryAfterSeconds?: number
}

export async function checkLoginRateLimit(
  key: string
): Promise<LoginRateLimitStatus> {
  const response = await apiRequest<ApiEnvelope<LoginRateLimitStatus>>(
    '/login-attempts/check',
    {
      method: 'POST',
      body: { key },
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
