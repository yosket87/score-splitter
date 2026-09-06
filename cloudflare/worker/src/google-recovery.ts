import type { D1DatabaseLike, Runtime } from './d1'
import { atomicAuth, completeAttempt, type OAuthClaim, type VerifiedGoogleIdentity } from './google-auth-shared'

export interface RecoveryApproval {
  id: string
  purpose: 'identity_recovery'
  target_user_id: string
  expected_old_identity_id: string
  expected_session_epoch: number
}

export async function consumeGoogleRecovery(db: D1DatabaseLike, runtime: Runtime, claim: OAuthClaim, identity: VerifiedGoogleIdentity, approval: RecoveryApproval) {
  const now = runtime.now().toISOString()
  const consumptionId = runtime.randomUUID()
  await atomicAuth(db, [
    completeAttempt(db, now, claim, identity),
    db.prepare(`UPDATE google_migration_requests SET status='consuming',consumption_id=?
      WHERE id=? AND purpose='identity_recovery' AND status='approved' AND issuer=? AND subject=? AND changes()=1
        AND julianday(expires_at)>julianday(?) AND julianday(approval_expires_at)>julianday(?)
        AND EXISTS(SELECT 1 FROM users u JOIN google_identities i ON i.user_id=u.id
          JOIN oauth_login_attempts a ON a.id=? AND a.claim_id=? AND a.sequence=? AND a.status='completed'
          WHERE u.id=target_user_id AND u.active=1 AND u.session_epoch=expected_session_epoch
            AND a.sequence>u.oauth_attempt_floor AND julianday(a.expires_at)>julianday(?)
            AND i.id=expected_old_identity_id AND i.revoked_at IS NULL)`)
      .bind(consumptionId, approval.id, identity.issuer, identity.subject, now, now, claim.attemptId, claim.claimId, claim.sequence, now),
    db.prepare(`UPDATE users SET session_epoch=session_epoch+1,
      oauth_attempt_floor=MAX(oauth_attempt_floor,COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts),0)),updated_at=?
      WHERE id=? AND active=1 AND session_epoch=? AND EXISTS(
        SELECT 1 FROM google_migration_requests WHERE id=? AND status='consuming' AND consumption_id=?)`)
      .bind(now, approval.target_user_id, approval.expected_session_epoch, approval.id, consumptionId),
    db.prepare(`UPDATE google_identities SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL AND changes()=1`)
      .bind(now, approval.expected_old_identity_id, approval.target_user_id),
    db.prepare(`INSERT INTO google_identities(id,user_id,issuer,subject,email,created_at)
      VALUES(?,(SELECT target_user_id FROM google_migration_requests WHERE id=? AND status='consuming' AND consumption_id=? AND changes()=1),?,?,?,?)`)
      .bind(runtime.randomUUID(), approval.id, consumptionId, identity.issuer, identity.subject, identity.email, now),
    db.prepare(`UPDATE google_migration_requests SET status='consumed',consumed_at=?,consumed_user_id=?
      WHERE id=? AND status='consuming' AND consumption_id=?`).bind(now, approval.target_user_id, approval.id, consumptionId),
  ])
  // 復旧自身の試行もfloor以下になる。ここではsessionを発行しない。
  return { kind: 'recovered' as const, userId: approval.target_user_id }
}
