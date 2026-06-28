import { apiRequest } from './client'
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

interface ApiData<T> {
  data: T
}

export async function listPasskeys(person?: Person): Promise<ApiPasskey[]> {
  const path = person ? `/passkeys?person=${encodeURIComponent(person)}` : '/passkeys'
  const response = await apiRequest<ApiData<ApiPasskey[]>>(path)
  return response.data
}

export async function getPasskey(id: string): Promise<ApiPasskey | null> {
  const response = await apiRequest<ApiData<ApiPasskey | null>>(
    `/passkeys/${encodeURIComponent(id)}`
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
  const response = await apiRequest<ApiData<ApiPasskey>>('/passkeys', {
    method: 'POST',
    body: input,
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
  const response = await apiRequest<ApiData<ApiChallenge>>('/webauthn-challenges', {
    method: 'POST',
    body: input,
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
  const response = await apiRequest<ApiData<ApiChallenge | null>>(
    `/webauthn-challenges/latest?${params}`
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
