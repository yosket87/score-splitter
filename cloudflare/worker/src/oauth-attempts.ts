import { z } from 'zod'
import type { D1DatabaseLike, Runtime } from './d1'
import { authOperation, claimSchema, expiresIn, GoogleAuthError, hashSecret, opaque, secret, type OAuthClaim } from './google-auth-shared'

const attemptInput = z.object({ state: secret, nonce: secret, codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/), browserBinding: secret })

export function createOAuthAttempt(db: D1DatabaseLike, runtime: Runtime, values: z.infer<typeof attemptInput>) {
  return authOperation(async () => {
    const input = attemptInput.parse(values)
    const now = runtime.now().toISOString()
    const attemptId = runtime.randomUUID()
    const expiresAt = expiresIn(now, 10 * 60_000)
    const [stateHash, browserHash] = await Promise.all([hashSecret(input.state), hashSecret(input.browserBinding)])
    await db.prepare(`INSERT INTO oauth_login_attempts(id,state_hash,browser_binding_hash,nonce,code_verifier,created_at,expires_at)
      VALUES(?,?,?,?,?,?,?)`).bind(attemptId, stateHash, browserHash, input.nonce, input.codeVerifier, now, expiresAt).run()
    return { attemptId, expiresAt }
  })
}

export function claimOAuthAttempt(db: D1DatabaseLike, runtime: Runtime, values: { attemptId: string; state: string; browserBinding: string }) {
  return authOperation(async () => {
    const input = z.object({ attemptId: opaque, state: secret, browserBinding: secret }).parse(values)
    const [stateHash, browserHash] = await Promise.all([hashSecret(input.state), hashSecret(input.browserBinding)])
    const claimId = runtime.randomUUID()
    const now = runtime.now().toISOString()
    const claimed = await db.prepare(`UPDATE oauth_login_attempts SET status='processing',claim_id=?,claimed_at=?
      WHERE id=? AND state_hash=? AND browser_binding_hash=? AND status='pending'
      AND julianday(expires_at)>julianday(?) AND julianday(expires_at)>julianday('now')
      RETURNING sequence,nonce,code_verifier AS codeVerifier`)
      .bind(claimId, now, input.attemptId, stateHash, browserHash, now)
      .first<{ sequence: number; nonce: string; codeVerifier: string }>()
    if (!claimed) throw new GoogleAuthError('attempt_invalid')
    return { attemptId: input.attemptId, claimId, ...claimed }
  })
}

export function failOAuthAttempt(db: D1DatabaseLike, runtime: Runtime, value: OAuthClaim) {
  return authOperation(async () => {
    const claim = claimSchema.parse(value)
    await db.prepare(`UPDATE oauth_login_attempts SET status='failed',nonce=NULL,code_verifier=NULL,completed_at=?
      WHERE id=? AND claim_id=? AND sequence=? AND status='processing'`)
      .bind(runtime.now().toISOString(), claim.attemptId, claim.claimId, claim.sequence).run()
  })
}

export function expireOAuthAttempts(db: D1DatabaseLike, runtime: Runtime) {
  return authOperation(async () => {
    const now = runtime.now().toISOString()
    await db.prepare(`UPDATE oauth_login_attempts SET status='expired',nonce=NULL,code_verifier=NULL,completed_at=?
      WHERE status IN ('pending','processing') AND julianday(expires_at)<=julianday(?)`).bind(now, now).run()
  })
}
