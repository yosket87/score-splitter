import { apiRequest } from './client'
import type { Person } from '@/types'

export interface ApiSession {
  token: string
  person: Person | null
  authMethod: 'password' | 'passkey'
  expiresAt: string
}

interface ApiData<T> {
  data: T
}

export async function createSession(input: {
  token: string
  person: Person | null
  authMethod: 'password' | 'passkey'
  expiresAt: string
}): Promise<ApiSession> {
  const response = await apiRequest<ApiData<ApiSession>>('/sessions', {
    method: 'POST',
    body: input,
  })
  return response.data
}

export async function getSession(token: string): Promise<ApiSession | null> {
  const response = await apiRequest<ApiData<ApiSession | null>>(
    `/sessions/${encodeURIComponent(token)}`
  )
  return response.data
}

export async function deleteSession(token: string): Promise<void> {
  await apiRequest(`/sessions/${encodeURIComponent(token)}`, { method: 'DELETE' })
}
