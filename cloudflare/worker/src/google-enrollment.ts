import type { D1DatabaseLike, Runtime } from './d1'
import { atomicAuth, completeAttempt, type OAuthClaim, type VerifiedGoogleIdentity } from './google-auth-shared'
import { insertGoogleSession, newGoogleSession } from './google-session-sql'

export interface EnrollmentApproval {
  id: string
  approved_household_id: string
  approved_default_person: 'husband' | 'wife'
  purpose: 'legacy_enrollment'
}

export async function consumeGoogleEnrollment(db: D1DatabaseLike, runtime: Runtime, claim: OAuthClaim, identity: VerifiedGoogleIdentity, approval: EnrollmentApproval) {
  const now = runtime.now().toISOString()
  const consumptionId = runtime.randomUUID()
  const userId = runtime.randomUUID()
  const membershipId = runtime.randomUUID()
  const session = newGoogleSession(now, userId, membershipId, approval.approved_household_id, approval.approved_default_person, 0)
  await atomicAuth(db, [
    completeAttempt(db, now, claim, identity),
    db.prepare(`UPDATE google_migration_requests SET status='consuming',consumption_id=?
      WHERE id=? AND status='approved' AND purpose='legacy_enrollment' AND issuer=? AND subject=?
        AND julianday(expires_at)>julianday(?) AND julianday(approval_expires_at)>julianday(?)
        AND julianday(expires_at)>julianday('now') AND julianday(approval_expires_at)>julianday('now') AND changes()=1
        AND EXISTS(SELECT 1 FROM oauth_login_attempts WHERE id=? AND claim_id=? AND sequence=? AND status='completed')`)
      .bind(consumptionId, approval.id, identity.issuer, identity.subject, now, now, claim.attemptId, claim.claimId, claim.sequence),
    db.prepare(`INSERT INTO users(id,created_at,updated_at)
      VALUES((SELECT ? FROM google_migration_requests WHERE id=? AND status='consuming' AND consumption_id=?),?,?)`)
      .bind(userId, approval.id, consumptionId, now, now),
    db.prepare('INSERT INTO google_identities(id,user_id,issuer,subject,email,created_at) VALUES(?,?,?,?,?,?)')
      .bind(runtime.randomUUID(), userId, identity.issuer, identity.subject, identity.email, now),
    db.prepare('INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES(?,?,?,?,?)')
      .bind(membershipId, userId, approval.approved_household_id, approval.approved_default_person, now),
    db.prepare(`UPDATE google_migration_requests SET status='consumed',consumed_at=?,consumed_user_id=?
      WHERE id=? AND status='consuming' AND consumption_id=?`).bind(now, userId, approval.id, consumptionId),
    insertGoogleSession(db, now, claim, session, true),
  ])
  return { kind: 'authenticated' as const, session }
}
