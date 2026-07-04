import { apiRequest } from './client'

export interface LoginRateLimitStatus {
  allowed: boolean
  retryAfterSeconds?: number
}

interface ApiData<T> {
  data: T
}

export async function checkLoginRateLimit(
  key: string
): Promise<LoginRateLimitStatus> {
  const response = await apiRequest<ApiData<LoginRateLimitStatus>>(
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
  const response = await apiRequest<ApiData<LoginRateLimitStatus>>(
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
