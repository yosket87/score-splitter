import type { D1DatabaseLike, Runtime } from '../../cloudflare/worker/src/d1'
import { createOAuthAttempt, claimOAuthAttempt } from '../../cloudflare/worker/src/oauth-attempts'
import { completeGoogleLogin } from '../../cloudflare/worker/src/google-login'
import { approveGoogleMigration } from '../../cloudflare/worker/src/google-migrations'
export const finalizationHousehold = '3975b870-bbfa-49fd-ae3d-d273c9f6e107'
export async function finalizationFixture(db: D1DatabaseLike, runtime: Runtime) {
  const members = []
  const sessions = []
  for (const [index, person] of ['husband', 'wife'].entries()) {
    const identity = { issuer: 'https://accounts.google.com' as const, subject: `finalize-${index}`, email: `finalize-${index}@example.invalid` }
    const login = async () => {
      const input = { state: crypto.randomUUID() + '-padding', nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43), browserBinding: 'b'.repeat(64) }
      const attempt = await createOAuthAttempt(db, runtime, input)
      const claim = await claimOAuthAttempt(db, runtime, { ...input, attemptId: attempt.attemptId })
      return completeGoogleLogin(db, runtime, claim, identity)
    }
    const pending = await login()
    if (pending.kind !== 'migration_pending') throw new Error('fixture申請なし')
    const legacySlot = index === 0 ? 'existing-member-1' as const : 'existing-member-2' as const
    await approveGoogleMigration(db, runtime, { requestId: pending.requestId, code: pending.code,
      approvedBy: 'fixture-operator', confirmationRef: `fixture-enroll-${index}`, householdId: finalizationHousehold, legacySlot, defaultPerson: person as 'husband' | 'wife' })
    const authenticated = await login()
    if (authenticated.kind !== 'authenticated') throw new Error('fixture認証なし')
    const session = authenticated.session
    sessions.push(session)
    const account = await db.prepare('SELECT id FROM google_identities WHERE user_id=? AND revoked_at IS NULL').bind(session.userId).first<{ id: string }>()
    members.push({ legacySlot, userId: session.userId, identityId: account!.id, membershipId: session.membershipId,
      sessionEpoch: session.sessionEpoch, reloginRef: `fixture-independent-login-${index}`, dataCheckRef: `fixture-data-checked-${index}` })
  }
  return { input: { householdId: finalizationHousehold, confirmedBy: 'fixture-operator', members }, sessions }
}
