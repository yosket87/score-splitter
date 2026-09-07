import 'server-only'
import { assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
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
  context: HouseholdContext,
  person: Person | null,
  authMethod: 'password' | 'passkey'
): Promise<string> {
  assertHouseholdContext(context)
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000)

  try {
    await createApiSession(context, {
      token,
      person,
      authMethod,
      expiresAt: expiresAt.toISOString(),
    })
  } catch {
    throw new Error('セッション作成に失敗しました')
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

export type { SessionInfo } from '@/types/auth'
import type { ApiSession, SessionInfo } from '@/types/auth'

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

  if (!data.householdId?.trim() || !['password', 'passkey', 'google', 'firebase'].includes(data.authMethod) ||
    !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) {
    return null
  }

  if (data.authMethod === 'google' || data.authMethod === 'firebase') {
    if (!data.userId?.trim() || !data.membershipId?.trim() || !Number.isSafeInteger(data.sessionEpoch) || data.sessionEpoch < 0) return null
    return { householdId: data.householdId, person: data.person, authMethod: data.authMethod,
      userId: data.userId, membershipId: data.membershipId, sessionEpoch: data.sessionEpoch }
  }
  return {
    householdId: data.householdId,
    person: data.person as Person | null,
    authMethod: data.authMethod,
  }
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
  return (await getSession()) !== null
}

export async function requireAuth(): Promise<SessionInfo> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}


// GoogleのDB batch成功後にのみ呼び出す。公開Server Actionにはしない。
export async function setGoogleSessionCookie(session: ApiSession): Promise<void> {
  if (session.authMethod !== 'google' || !/^[a-f0-9]{64}$/.test(session.token)) throw new Error('認証情報が不正です')
  await setVerifiedSessionCookie(session, SESSION_MAX_AGE)
}

// ID tokenより長いCookieを発行しない。DB確定後だけ呼び出す。
export async function setFirebaseSessionCookie(session: ApiSession): Promise<void> {
  if (session.authMethod !== 'firebase' || !/^[a-f0-9]{64}$/.test(session.token)) throw new Error('認証情報が不正です')
  await setVerifiedSessionCookie(session, 3600)
}

async function setVerifiedSessionCookie(session: ApiSession, maximumAge: number): Promise<void> {
  const remaining = Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('認証情報の期限が切れています')
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    maxAge: Math.min(remaining, maximumAge), path: '/',
  })
}
