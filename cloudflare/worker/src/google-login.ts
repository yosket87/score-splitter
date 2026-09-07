import type { D1DatabaseLike, Runtime } from './d1'
import { authOperation, atomicAuth, completeAttempt, GoogleAuthError, claimSchema, verifiedIdentitySchema, type OAuthClaim, type VerifiedGoogleIdentity } from './google-auth-shared'
import { insertGoogleSession, newGoogleSession } from './google-session-sql'
import { consumeGoogleRecovery, type RecoveryApproval } from './google-recovery'
import { consumeGoogleEnrollment, type EnrollmentApproval } from './google-enrollment'
import { createGoogleMigrationRequest } from './google-migrations'

// この入口のidentityは、OIDCプロトコルで署名まで検証した結果だけを渡す。
export function completeGoogleLogin(db: D1DatabaseLike, runtime: Runtime, claimValue: OAuthClaim, identityValue: VerifiedGoogleIdentity) {
  return authOperation(async () => {
    const claim = claimSchema.parse(claimValue)
    const identity = verifiedIdentitySchema.parse(identityValue)
    const existing = await db.prepare(`SELECT i.user_id,i.revoked_at,u.active,u.session_epoch
      FROM google_identities i JOIN users u ON u.id=i.user_id WHERE i.issuer=? AND i.subject=?`)
      .bind(identity.issuer, identity.subject).first<{ user_id: string; revoked_at: string | null; active: number; session_epoch: number }>()
    if (existing) {
      if (existing.revoked_at !== null || existing.active !== 1) throw new GoogleAuthError('identity_denied')
      const { results: memberships } = await db.prepare(`SELECT id,household_id,default_person FROM household_memberships WHERE user_id=? AND revoked_at IS NULL`)
        .bind(existing.user_id).all<{ id: string; household_id: string; default_person: 'husband' | 'wife' }>()
      if (memberships.length !== 1) throw new GoogleAuthError('identity_denied')
      const membership = memberships[0]
      const now = runtime.now().toISOString()
      const session = newGoogleSession(now, existing.user_id, membership.id, membership.household_id, membership.default_person, existing.session_epoch)
      await atomicAuth(db, [completeAttempt(db, now, claim, identity), insertGoogleSession(db, now, claim, session, true)])
      return { kind: 'authenticated' as const, session }
    }
    const approved = await db.prepare(`SELECT * FROM google_migration_requests
      WHERE issuer=? AND subject=? AND status='approved'
        AND julianday(expires_at)>julianday(?) AND julianday(approval_expires_at)>julianday(?)`)
      .bind(identity.issuer, identity.subject, runtime.now().toISOString(), runtime.now().toISOString()).first<EnrollmentApproval | RecoveryApproval>()
    if (approved?.purpose === 'identity_recovery') return consumeGoogleRecovery(db, runtime, claim, identity, approved)
    if (approved) return consumeGoogleEnrollment(db, runtime, claim, identity, approved)
    return createGoogleMigrationRequest(db, runtime, claim, identity)
  })
}
