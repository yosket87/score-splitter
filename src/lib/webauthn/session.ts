import { cookies } from 'next/headers'
import {
  createSession as createApiSession,
  deleteSession as deleteApiSession,
  getSession as getApiSession,
} from '@/lib/api/sessions'
import type { Person } from '@/types'

const SESSION_COOKIE_NAME = 'household_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7日間

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createSession(
  person: Person | null,
  authMethod: 'password' | 'passkey'
): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000)

  try {
    await createApiSession({
    token,
    person,
      authMethod,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー'
    throw new Error(`セッション作成に失敗しました: ${message}`)
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  return token
}

export interface SessionInfo {
  person: Person | null
  authMethod: 'password' | 'passkey'
}

export async function getSession(): Promise<SessionInfo | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!cookie?.value) {
    return null
  }

  const data = await getApiSession(cookie.value)

  if (!data) {
    return null
  }

  if (new Date(data.expiresAt) < new Date()) {
    await deleteSession()
    return null
  }

  return {
    person: data.person as Person | null,
    authMethod: data.authMethod,
  }
}

export async function getSessionPerson(): Promise<Person | null> {
  const session = await getSession()
  return session?.person ?? null
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (cookie?.value) {
    await deleteApiSession(cookie.value)
  }

  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!cookie?.value) {
    return false
  }

  const data = await getApiSession(cookie.value)
  if (!data) {
    return false
  }

  return new Date(data.expiresAt) > new Date()
}
