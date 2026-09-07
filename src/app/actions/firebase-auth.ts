'use server'

import { cookies, headers } from 'next/headers'
import { firebaseAuthConfig, matchesFirebaseOrigin } from '@/lib/auth/firebase-config'
import { verifyFirebaseToken } from '@/lib/auth/firebase-token'
import { canExchangeFirebaseSession } from '@/lib/auth/firebase-session-policy'
import { completeFirebaseLogin, getFirebaseAccount, revokeFirebaseSessions } from '@/lib/api/firebase-auth'
import { setFirebaseSessionCookie } from '@/lib/webauthn/session'
import { isFirebaseMockEnabled } from '@/lib/mock-mode'

export type FirebaseExchangeResult = { ok: true; destination: '/' | '/auth/migration' | '/login?firebase=recovered' } | { ok: false; error: string }
const failure = { ok: false as const, error: 'ログインを確認できませんでした。もう一度ログインしてください。' }

export async function exchangeFirebaseSession(token: string, mode: 'login' | 'refresh'): Promise<FirebaseExchangeResult> {
  try {
    const config = firebaseAuthConfig()
    if (!config || !matchesFirebaseOrigin(await headers(), config) ||
      typeof token !== 'string' || token.length > 16 * 1024 || (mode !== 'login' && mode !== 'refresh')) return failure
    const identity = isFirebaseMockEnabled()
      ? (await import('@/mocks/firebase-auth')).verifyMockFirebaseToken(token)
      : await verifyFirebaseToken(token, config.client)
    if ((identity.provider === 'google.com' && !config.client.googleEnabled) ||
      (identity.provider === 'apple.com' && !config.client.appleEnabled)) return failure
    const cookieStore = await cookies()
    const currentToken = cookieStore.get('household_session')?.value
    const current = currentToken ? await getFirebaseAccount(currentToken) : null
    if (!canExchangeFirebaseSession(identity, current, mode, Math.floor(Date.now() / 1000))) return failure
    const result = await completeFirebaseLogin(identity, { mode, currentToken })
    if (result.kind === 'authenticated') {
      await setFirebaseSessionCookie(result.session)
      cookieStore.delete('firebase_migration_request')
      return { ok: true, destination: '/' }
    }
    if (result.kind === 'migration_pending') {
      const maxAge = Math.floor((Date.parse(result.expiresAt) - Date.now()) / 1000)
      if (!Number.isFinite(maxAge) || maxAge <= 0) return failure
      cookieStore.set('firebase_migration_request', JSON.stringify({ id: result.requestId, secret: result.browserSecret, code: result.code }), {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: Math.min(maxAge, 1800),
      })
      return { ok: true, destination: '/auth/migration' }
    }
    cookieStore.delete('household_session')
    cookieStore.delete('firebase_migration_request')
    return { ok: true, destination: '/login?firebase=recovered' }
  } catch {
    return failure
  }
}

export async function logoutAllFirebaseSessions(): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = firebaseAuthConfig()
    if (!config || !matchesFirebaseOrigin(await headers(), config)) return failure
    const cookieStore = await cookies()
    const token = cookieStore.get('household_session')?.value
    if (!token) return failure
    await revokeFirebaseSessions(token)
    cookieStore.delete('household_session')
    return { ok: true }
  } catch { return { ok: false, error: 'ログアウトできませんでした。時間をおいてもう一度お試しください。' } }
}
