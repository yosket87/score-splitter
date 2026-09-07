import { z } from 'zod'
import type { D1DatabaseLike, Runtime } from './d1'
import { authOperation, GoogleAuthError, opaque } from './google-auth-shared'

export function revokeGoogleSessions(db: D1DatabaseLike, runtime: Runtime, token: string) {
  return authOperation(async () => {
    z.string().regex(/^[a-f0-9]{64}$/).parse(token)
    const now = runtime.now().toISOString()
    const row = await db.prepare(`UPDATE users SET session_epoch=session_epoch+1,
      oauth_attempt_floor=MAX(oauth_attempt_floor,COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts),0)),updated_at=?
      WHERE active=1 AND session_epoch<9007199254740991 AND EXISTS(
        SELECT 1 FROM sessions s JOIN household_memberships m ON m.id=s.membership_id AND m.user_id=s.user_id AND m.household_id=s.household_id
        WHERE s.token=? AND s.auth_method='google' AND s.user_id=users.id AND s.session_epoch=users.session_epoch
          AND m.revoked_at IS NULL AND julianday(s.expires_at)>julianday(?))
      RETURNING id AS userId,session_epoch AS sessionEpoch`).bind(now, token, now).first<{ userId: string; sessionEpoch: number }>()
    if (!row) throw new GoogleAuthError('session_invalid')
    return row
  })
}

// 運営専用ドメイン。公開HTTPや通常のユーザー操作へ接続しない。
export function deactivateGoogleUser(db: D1DatabaseLike, runtime: Runtime, values: { userId: string; expectedEpoch: number }) {
  return authOperation(async () => {
    const input = z.object({ userId: opaque, expectedEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) }).parse(values)
    const row = await db.prepare(`UPDATE users SET active=0,session_epoch=session_epoch+1,
      oauth_attempt_floor=MAX(oauth_attempt_floor,COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts),0)),updated_at=?
      WHERE id=? AND active=1 AND session_epoch=? RETURNING id AS userId,session_epoch AS sessionEpoch`)
      .bind(runtime.now().toISOString(), input.userId, input.expectedEpoch).first<{ userId: string; sessionEpoch: number }>()
    if (!row) throw new GoogleAuthError('session_invalid')
    return row
  })
}
