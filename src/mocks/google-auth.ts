import { getTable, insertRows, updateRows } from './db'
import { apiSession, validSession, MOCK_LEGACY_HOUSEHOLD_ID as householdId } from './auth-handlers'
import { googleState } from './google-state'
import { GoogleAuthError, hashSecret, randomSecret, type OAuthClaim, type VerifiedGoogleIdentity } from '../../cloudflare/worker/src/google-auth-shared'
import type { GoogleSessionData } from '../../cloudflare/worker/src/google-session-sql'
const now = () => new Date().toISOString()
const expiry = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString()
const valid = (time: string) => Date.parse(time) > Date.now()

export function seedGoogleMember(person: 'a' | 'b') {
  const id = `user-${person}`
  if (getTable('users').some(user => user.id === id)) return
  insertRows('users', [{ id, active: 1, session_epoch: 0, oauth_attempt_floor: 0 }])
  insertRows('google_identities', [{ id: `identity-${person}`, user_id: id, issuer: 'https://accounts.google.com', subject: `member-${person}`,
    email: `${person}.very-long-account-name-for-layout@example.com`, revoked_at: null }])
  insertRows('household_memberships', [{ id: `membership-${person}`, user_id: id, household_id: householdId, default_person: person === 'a' ? 'husband' : 'wife', revoked_at: null }])
}
export function prepareGoogleScenario(scenario: string): string {
  if (['member-a', 'member-b', 'recovery'].includes(scenario)) seedGoogleMember(scenario === 'member-b' ? 'b' : 'a')
  if (scenario === 'approve-pending' || scenario === 'approve-recovery' || scenario === 'expire-pending') {
    const subject = scenario === 'approve-recovery' ? 'replacement-a' : 'pending-a'
    const request = googleState().requests.findLast(row => row.subject === subject && row.status === 'pending')
    if (!request) throw new GoogleAuthError('approval_invalid')
    request.status = scenario === 'expire-pending' ? 'expired' : 'approved'
    if (scenario === 'approve-recovery') request.purpose = 'identity_recovery'
    return scenario === 'approve-recovery' ? 'recovery' : 'pending-a'
  }
  return scenario
}
export async function createOAuthAttempt(input: { state: string; nonce: string; codeVerifier: string; browserBinding: string }) {
  const [stateHash, browserHash] = await Promise.all([hashSecret(input.state), hashSecret(input.browserBinding)])
  const state = googleState()
  const row = { id: crypto.randomUUID(), sequence: ++state.sequence, stateHash, browserHash, nonce: input.nonce, codeVerifier: input.codeVerifier, status: 'pending', expiresAt: expiry(10) }
  state.attempts.push(row)
  return { attemptId: row.id, expiresAt: row.expiresAt }
}
export async function expireOAuthAttempts() {
  for (const row of googleState().attempts) {
    if (['pending', 'processing'].includes(row.status) && !valid(row.expiresAt)) {
      row.status = 'expired'; row.nonce = null; row.codeVerifier = null
    }
  }
}
export async function claimOAuthAttempt(input: { attemptId: string; state: string; browserBinding: string }) {
  const [stateHash, browserHash] = await Promise.all([hashSecret(input.state), hashSecret(input.browserBinding)])
  const row = googleState().attempts.find(row => row.id === input.attemptId && row.status === 'pending' && valid(row.expiresAt) && row.stateHash === stateHash && row.browserHash === browserHash)
  if (!row || !row.nonce || !row.codeVerifier) throw new GoogleAuthError('attempt_invalid')
  row.status = 'processing'; row.claimId = crypto.randomUUID()
  return { attemptId: row.id, claimId: row.claimId, sequence: row.sequence, nonce: row.nonce, codeVerifier: row.codeVerifier }
}
export async function failOAuthAttempt(claim: OAuthClaim) {
  const row = googleState().attempts.find(row => row.id === claim.attemptId && row.claimId === claim.claimId && row.status === 'processing')
  if (row) { row.status = 'failed'; row.nonce = null; row.codeVerifier = null }
}
function issueSession(userId: string): GoogleSessionData {
  const user = getTable('users').find(row => row.id === userId && row.active === 1)
  const members = getTable('household_memberships').filter(row => row.user_id === userId && row.revoked_at === null)
  if (!user || members.length !== 1) throw new GoogleAuthError('identity_denied')
  const member = members[0]
  const row = insertRows('sessions', [{ token: randomSecret(), household_id: member.household_id, person: member.default_person, auth_method: 'google',
    user_id: userId, membership_id: member.id, session_epoch: user.session_epoch, expires_at: expiry(7 * 24 * 60) }])[0]
  return apiSession(row) as GoogleSessionData
}
export async function completeGoogleLogin(claim: OAuthClaim, identity: VerifiedGoogleIdentity) {
  const state = googleState()
  const attempt = state.attempts.find(row => row.id === claim.attemptId && row.claimId === claim.claimId && row.sequence === claim.sequence && row.status === 'processing' && valid(row.expiresAt))
  if (!attempt) throw new GoogleAuthError('attempt_invalid')
  const linked = getTable('google_identities').find(row => row.issuer === identity.issuer && row.subject === identity.subject)
  if (linked) {
    const user = getTable('users').find(row => row.id === linked.user_id)
    if (linked.revoked_at !== null || user?.active !== 1 || claim.sequence <= Number(user.oauth_attempt_floor)) throw new GoogleAuthError('identity_denied')
    const session = issueSession(String(linked.user_id))
    attempt.status = 'completed'; attempt.nonce = null; attempt.codeVerifier = null
    return { kind: 'authenticated' as const, session }
  }
  const approved = state.requests.find(row => row.subject === identity.subject && row.status === 'approved' && valid(row.expiresAt))
  if (approved) {
    if (approved.purpose === 'identity_recovery') {
      for (const old of getTable('google_identities').filter(row => row.user_id === 'user-a' && row.revoked_at === null)) {
        updateRows('google_identities', { id: `eq.${old.id}` }, { revoked_at: now() })
      }
      const user = getTable('users').find(row => row.id === 'user-a')!
      updateRows('users', { id: 'eq.user-a' }, { session_epoch: Number(user.session_epoch) + 1, oauth_attempt_floor: state.sequence })
      insertRows('google_identities', [{ id: crypto.randomUUID(), user_id: 'user-a', issuer: identity.issuer, subject: identity.subject, email: identity.email, revoked_at: null }])
      approved.status = 'consumed'; attempt.status = 'completed'; attempt.nonce = null; attempt.codeVerifier = null
      return { kind: 'recovered' as const, userId: 'user-a' }
    }
    seedGoogleMember('a')
    updateRows('google_identities', { id: 'eq.identity-a' }, { subject: identity.subject, email: identity.email })
    const session = issueSession('user-a')
    approved.status = 'consumed'; attempt.status = 'completed'; attempt.nonce = null; attempt.codeVerifier = null
    return { kind: 'authenticated' as const, session }
  }
  const code = randomSecret(), browserSecret = randomSecret(), requestId = crypto.randomUUID(), expiresAt = expiry(30)
  const [codeHash, browserHash] = await Promise.all([hashSecret(code), hashSecret(browserSecret)])
  state.requests.push({ requestId, subject: identity.subject, email: identity.email, codeHash, browserHash, expiresAt, status: 'pending', purpose: 'legacy_enrollment' })
  attempt.status = 'completed'; attempt.nonce = null; attempt.codeVerifier = null
  return { kind: 'migration_pending' as const, requestId, code, browserSecret, expiresAt }
}
export async function getGoogleMigrationRequest(requestId: string, browserSecret: string) {
  const hash = await hashSecret(browserSecret)
  const row = googleState().requests.find(row => row.requestId === requestId && row.browserHash === hash && valid(row.expiresAt) && ['pending','approved','consumed'].includes(row.status))
  return row ? { requestId, email: row.email, status: row.status, purpose: row.purpose, expiresAt: row.expiresAt } : null
}
export async function getGoogleMigrationDisplay(requestId: string, browserSecret: string, code: string) {
  const display = await getGoogleMigrationRequest(requestId, browserSecret)
  const hash = await hashSecret(code)
  return display && googleState().requests.some(row => row.requestId === requestId && row.codeHash === hash) ? { ...display, code } : null
}
export async function getGoogleAccount(token: string) {
  const row = validSession(token)
  if (!row || row.auth_method !== 'google') return null
  const identity = getTable('google_identities').find(identity => identity.user_id === row.user_id && identity.revoked_at === null)
  return identity ? { email: String(identity.email) } : null
}
export async function revokeGoogleSessions(token: string) {
  const row = validSession(token)
  if (!row || row.auth_method !== 'google') throw new GoogleAuthError('session_invalid')
  const sessionEpoch = Number(row.session_epoch) + 1
  updateRows('users', { id: `eq.${row.user_id}` }, { session_epoch: sessionEpoch, oauth_attempt_floor: googleState().sequence })
  return { userId: String(row.user_id), sessionEpoch }
}
