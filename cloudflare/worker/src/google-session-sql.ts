import type { D1DatabaseLike } from './d1'
import { expiresIn, randomSecret, type OAuthClaim } from './google-auth-shared'

export interface GoogleSessionData {
  token: string
  householdId: string
  person: 'husband' | 'wife'
  authMethod: 'google'
  userId: string
  membershipId: string
  sessionEpoch: number
  expiresAt: string
}
export function newGoogleSession(now: string, userId: string, membershipId: string, householdId: string, person: 'husband' | 'wife', sessionEpoch: number): GoogleSessionData {
  return { token: randomSecret(), householdId, person, authMethod: 'google', userId, membershipId, sessionEpoch, expiresAt: expiresIn(now, 7 * 24 * 60 * 60_000) }
}

// Googleのuser_idはCHECKで必須。条件不成立をNULLにし、先行UPDATEごとrollbackする。
export function insertGoogleSession(db: D1DatabaseLike, now: string, claim: OAuthClaim, session: GoogleSessionData, requirePreviousChange = false) {
  return db.prepare(`INSERT INTO sessions(token,household_id,person,auth_method,expires_at,created_at,user_id,membership_id,session_epoch,oauth_attempt_sequence)
    VALUES(?,?,?,'google',?,?,(SELECT u.id FROM users u
      JOIN household_memberships m ON m.user_id=u.id AND m.id=? AND m.household_id=? AND m.revoked_at IS NULL
      JOIN google_identities i ON i.user_id=u.id AND i.revoked_at IS NULL
      JOIN oauth_login_attempts a ON a.id=? AND a.claim_id=? AND a.sequence=? AND a.status='completed'
        AND a.verified_issuer=i.issuer AND a.verified_subject=i.subject
      WHERE u.id=? AND u.active=1 AND u.session_epoch=? AND a.sequence>u.oauth_attempt_floor
        AND (SELECT COUNT(*) FROM household_memberships WHERE user_id=u.id AND revoked_at IS NULL)=1
        AND julianday(a.expires_at)>julianday(?) AND julianday(a.expires_at)>julianday('now')
        AND (?=0 OR changes()=1)),?,?,?)`)
    .bind(session.token, session.householdId, session.person, session.expiresAt, now,
      session.membershipId, session.householdId, claim.attemptId, claim.claimId, claim.sequence, session.userId, session.sessionEpoch,
      now, requirePreviousChange ? 1 : 0, session.membershipId, session.sessionEpoch, claim.sequence)
}
