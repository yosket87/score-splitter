import type { D1DatabaseLike, Runtime } from '../../cloudflare/worker/src/d1'
import { completeFirebaseLogin } from '../../cloudflare/worker/src/firebase-login'
import { approveFirebaseMigration } from '../../cloudflare/worker/src/firebase-migrations'
export const finalizationHousehold = '3975b870-bbfa-49fd-ae3d-d273c9f6e107'
export async function finalizationFixture(db: D1DatabaseLike, runtime: Runtime) {
  const members = []
  const sessions = []
  for (const [index, person] of ['husband', 'wife'].entries()) {
    const seconds = Math.floor(runtime.now().getTime() / 1000)
    const identity = { projectId: 'fixture-project', uid: `finalize-${index}`, provider: 'google.com' as const,
      email: null, authTime: seconds, issuedAt: seconds, expiresAt: seconds + 3600 }
    const login = () => completeFirebaseLogin(db, runtime, identity, { mode: 'login' })
    const pending = await login()
    if (pending.kind !== 'migration_pending') throw new Error('fixture申請なし')
    const legacySlot = index === 0 ? 'existing-member-1' as const : 'existing-member-2' as const
    await approveFirebaseMigration(db, runtime, { requestId: pending.requestId, code: pending.code,
      approvedBy: 'fixture-operator', confirmationRef: `fixture-enroll-${index}`, householdId: finalizationHousehold,
      legacySlot, defaultPerson: person as 'husband' | 'wife' })
    const authenticated = await login()
    if (authenticated.kind !== 'authenticated') throw new Error('fixture認証なし')
    const session = authenticated.session
    sessions.push(session)
    const account = await db.prepare('SELECT id FROM firebase_identities WHERE user_id=? AND revoked_at IS NULL')
      .bind(session.userId).first<{ id: string }>()
    members.push({ legacySlot, userId: session.userId, identityId: account!.id, membershipId: session.membershipId,
      sessionEpoch: session.sessionEpoch, reloginRef: `fixture-independent-login-${index}`, dataCheckRef: `fixture-data-checked-${index}` })
  }
  return { input: { projectId: 'fixture-project', householdId: finalizationHousehold, confirmedBy: 'fixture-operator', members }, sessions }
}
