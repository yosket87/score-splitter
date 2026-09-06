import { z } from 'zod'
import type { D1DatabaseLike, Runtime } from './d1'
import { authOperation, atomicAuth, completeAttempt, expiresIn, hashSecret, GoogleAuthError, opaque, randomSecret, secret, type OAuthClaim, type VerifiedGoogleIdentity } from './google-auth-shared'

export function createGoogleMigrationRequest(db: D1DatabaseLike, runtime: Runtime, claim: OAuthClaim, identity: VerifiedGoogleIdentity) {
  return authOperation(async () => {
    const now = runtime.now().toISOString()
    const requestId = runtime.randomUUID()
    const code = randomSecret()
    const browserSecret = randomSecret()
    const expiresAt = expiresIn(now, 30 * 60_000)
    const [codeHash, browserHash] = await Promise.all([hashSecret(code), hashSecret(browserSecret)])
    await atomicAuth(db, [completeAttempt(db, now, claim, identity), db.prepare(`
      INSERT INTO google_migration_requests(id,purpose,issuer,subject,email,code_hash,browser_binding_hash,created_at,expires_at)
      VALUES((SELECT ? FROM oauth_login_attempts WHERE id=? AND claim_id=? AND sequence=? AND status='completed'
        AND verified_issuer=? AND verified_subject=? AND julianday(expires_at)>julianday(?) AND changes()=1),
        'legacy_enrollment',?,?,?,?,?,?,?)`)
      .bind(requestId, claim.attemptId, claim.claimId, claim.sequence, identity.issuer, identity.subject, now,
        identity.issuer, identity.subject, identity.email, codeHash, browserHash, now, expiresAt)])
    return { kind: 'migration_pending' as const, requestId, code, browserSecret, expiresAt }
  })
}

export function getGoogleMigrationRequest(db: D1DatabaseLike, runtime: Runtime, requestId: string, browserSecret: string) {
  return authOperation(async () => {
    opaque.parse(requestId); secret.parse(browserSecret)
    const browserHash = await hashSecret(browserSecret)
    const now = runtime.now().toISOString()
    return db.prepare(`SELECT id AS requestId,email,status,purpose,expires_at AS expiresAt
      FROM google_migration_requests WHERE id=? AND browser_binding_hash=? AND julianday(expires_at)>julianday(?)
      AND status IN ('pending','approved','consumed')
      AND (status<>'approved' OR julianday(approval_expires_at)>julianday(?))`)
      .bind(requestId, browserHash, now, now)
      .first<{ requestId: string; email: string; status: string; purpose: string; expiresAt: string }>()
  })
}


export function expireGoogleMigrationRequests(db: D1DatabaseLike, runtime: Runtime) {
  return authOperation(async () => {
    const now = runtime.now().toISOString()
    await db.prepare(`UPDATE google_migration_requests SET status='expired'
      WHERE status IN ('pending','approved') AND (julianday(expires_at)<=julianday(?)
        OR (status='approved' AND julianday(approval_expires_at)<=julianday(?)))`).bind(now, now).run()
  })
}

const approvalSchema = z.object({
  requestId: opaque, code: secret, approvedBy: opaque, confirmationRef: opaque,
  householdId: opaque, legacySlot: z.enum(['existing-member-1', 'existing-member-2']), defaultPerson: z.enum(['husband', 'wife']),
})
export type GoogleMigrationApproval = z.infer<typeof approvalSchema>

// 後続CLIもこの関数を呼び、期限清掃と同じ承認SQLを必ず使う。
export function approveGoogleMigration(db: D1DatabaseLike, runtime: Runtime, values: GoogleMigrationApproval) {
  return authOperation(async () => {
    const input = approvalSchema.parse(values)
    await expireGoogleMigrationRequests(db, runtime)
    const now = runtime.now().toISOString()
    const approvalExpiry = expiresIn(now, 10 * 60_000)
    const row = await db.prepare(`UPDATE google_migration_requests SET status='approved',approved_at=?,
      approval_expires_at=CASE WHEN julianday(expires_at)<julianday(?) THEN expires_at ELSE ? END,
      approved_by=?,confirmation_ref=?,approved_household_id=?,approved_default_person=?,legacy_slot=?
      WHERE id=? AND code_hash=? AND status='pending' AND purpose='legacy_enrollment' AND julianday(expires_at)>julianday(?)
      AND EXISTS(SELECT 1 FROM households WHERE id=? AND legacy_auth_key='legacy' AND legacy_auth_disabled_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM google_identities WHERE issuer=google_migration_requests.issuer AND subject=google_migration_requests.subject)
      RETURNING id AS requestId`)
      .bind(now, approvalExpiry, approvalExpiry, input.approvedBy, input.confirmationRef, input.householdId, input.defaultPerson,
        input.legacySlot, input.requestId, await hashSecret(input.code), now, input.householdId).first<{ requestId: string }>()
    if (!row) throw new GoogleAuthError('approval_invalid')
    return row
  })
}

const recoverySchema = z.object({
  requestId: opaque, code: secret, approvedBy: opaque, confirmationRef: opaque,
  targetUserId: opaque, expectedOldIdentityId: opaque, expectedEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
})
export type GoogleRecoveryApproval = z.infer<typeof recoverySchema>
export function approveGoogleRecovery(db: D1DatabaseLike, runtime: Runtime, values: GoogleRecoveryApproval) {
  return authOperation(async () => {
    const input = recoverySchema.parse(values)
    await expireGoogleMigrationRequests(db, runtime)
    const now = runtime.now().toISOString()
    const approvalExpiry = expiresIn(now, 10 * 60_000)
    const row = await db.prepare(`UPDATE google_migration_requests SET status='approved',purpose='identity_recovery',approved_at=?,
      approval_expires_at=CASE WHEN julianday(expires_at)<julianday(?) THEN expires_at ELSE ? END,
      approved_by=?,confirmation_ref=?,target_user_id=?,expected_old_identity_id=?,expected_session_epoch=?
      WHERE id=? AND code_hash=? AND status='pending' AND julianday(expires_at)>julianday(?)
      AND EXISTS(SELECT 1 FROM users u JOIN google_identities i ON i.user_id=u.id
        WHERE u.id=? AND u.active=1 AND u.session_epoch=? AND i.id=? AND i.revoked_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM google_identities WHERE issuer=google_migration_requests.issuer AND subject=google_migration_requests.subject)
      RETURNING id AS requestId`)
      .bind(now, approvalExpiry, approvalExpiry, input.approvedBy, input.confirmationRef, input.targetUserId,
        input.expectedOldIdentityId, input.expectedEpoch, input.requestId, await hashSecret(input.code), now,
        input.targetUserId, input.expectedEpoch, input.expectedOldIdentityId).first<{ requestId: string }>()
    if (!row) throw new GoogleAuthError('approval_invalid')
    return row
  })
}
