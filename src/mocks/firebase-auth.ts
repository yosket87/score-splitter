import { isFirebaseMockEnabled } from '@/lib/mock-mode'
import type { VerifiedFirebaseIdentity } from '@/lib/auth/firebase-token'
import { canExchangeFirebaseSession } from '@/lib/auth/firebase-session-policy'
import { getTable, insertRows, updateRows } from './db'
import { apiSession, validSession, MOCK_LEGACY_HOUSEHOLD_ID } from './auth-handlers'
import { randomSecret, hashSecret } from '../../cloudflare/worker/src/google-auth-shared'
import type { FirebaseSessionData } from '../../cloudflare/worker/src/firebase-session-sql'

function assertMock() { if (!isFirebaseMockEnabled()) throw new Error('ローカル検証専用です') }
export function verifyMockFirebaseToken(token: string): VerifiedFirebaseIdentity {
  assertMock()
  const match = /^mock:(google\.com|apple\.com):(member-a|pending-a)$/.exec(token)
  if (!match) throw new Error('モック認証が不正です')
  const now = Math.floor(Date.now() / 1000)
  const scenario = getTable('firebase_mock_config')[0]?.scenario
  return { projectId: 'yamawake-mock', uid: scenario === 'pending-a' ? scenario : match[2], provider: match[1] as VerifiedFirebaseIdentity['provider'],
    email: 'firebase.local-layout-test@example.com', authTime: now, issuedAt: now, expiresAt: now + 3600 }
}
export function getMockFirebaseAccount(token: string) {
  assertMock()
  const session = validSession(token)
  if (session?.auth_method !== 'firebase') return null
  const identity = getTable('firebase_identities').find(row => row.id === session.firebase_identity_id && row.revoked_at === null)
  return identity ? { projectId: String(identity.project_id), uid: String(identity.uid), email: String(identity.email) } : null
}
export async function completeMockFirebaseLogin(identity: VerifiedFirebaseIdentity, options: { mode: 'login' | 'refresh'; currentToken?: string }) {
  assertMock()
  const now = Math.floor(Date.now() / 1000)
  const current = options.currentToken ? getMockFirebaseAccount(options.currentToken) : null
  if (!canExchangeFirebaseSession(identity, current, options.mode, now)) throw new Error('ログインし直してください')
  if (identity.uid === 'pending-a') {
    const requestId = crypto.randomUUID(), browserSecret = randomSecret(), code = randomSecret()
    const expiresAt = new Date(Date.now() + 600_000).toISOString()
    insertRows('firebase_migration_requests', [{ id: requestId, email: identity.email, status: 'pending', browser_hash: await hashSecret(browserSecret), code_hash: await hashSecret(code), expires_at: expiresAt }])
    return { kind: 'migration_pending' as const, requestId, browserSecret, code, expiresAt }
  }
  const userId = 'firebase-user-a'
  if (!getTable('users').some(row => row.id === userId)) {
    insertRows('users', [{ id: userId, active: 1, session_epoch: 0, firebase_auth_time_floor: 0 }])
    insertRows('household_memberships', [{ id: 'firebase-membership-a', user_id: userId, household_id: MOCK_LEGACY_HOUSEHOLD_ID, default_person: 'husband', revoked_at: null }])
    insertRows('firebase_identities', [{ id: 'firebase-identity-a', user_id: userId, project_id: identity.projectId, uid: identity.uid, email: identity.email, revoked_at: null }])
  }
  const user = getTable('users').find(row => row.id === userId)!
  if (identity.authTime <= Number(user.firebase_auth_time_floor)) throw new Error('ログインし直してください')
  const row = insertRows('sessions', [{ token: randomSecret(), household_id: MOCK_LEGACY_HOUSEHOLD_ID, person: 'husband', auth_method: 'firebase',
    user_id: userId, membership_id: 'firebase-membership-a', session_epoch: user.session_epoch, firebase_identity_id: 'firebase-identity-a', firebase_auth_time: identity.authTime,
    expires_at: new Date(Math.min(identity.expiresAt, now + 3600) * 1000).toISOString() }])[0]
  return { kind: 'authenticated' as const, session: apiSession(row) as FirebaseSessionData }
}
export async function getMockFirebaseMigrationDisplay(id: string, secret: string, code: string) {
  assertMock()
  const [browserHash, codeHash] = await Promise.all([hashSecret(secret), hashSecret(code)])
  const row = getTable('firebase_migration_requests').find(row => row.id === id && row.browser_hash === browserHash && row.code_hash === codeHash && Date.parse(String(row.expires_at)) > Date.now())
  return row ? { email: String(row.email), status: String(row.status), code } : null
}
export function revokeMockFirebaseSessions(token: string) {
  assertMock()
  const session = validSession(token)
  if (session?.auth_method !== 'firebase') throw new Error('ログインし直してください')
  const user = getTable('users').find(row => row.id === session.user_id)!
  updateRows('users', { id: `eq.${user.id}` }, { session_epoch: Number(user.session_epoch) + 1, firebase_auth_time_floor: Math.floor(Date.now() / 1000) })
}
