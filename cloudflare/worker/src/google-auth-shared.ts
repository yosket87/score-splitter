import { z } from 'zod'
import { HttpError } from './http'
import type { D1DatabaseLike, D1PreparedStatementLike } from './d1'

export type GoogleAuthErrorCode = 'invalid_input' | 'attempt_invalid' | 'identity_denied' | 'approval_invalid' | 'session_invalid' | 'operation_failed'
export class GoogleAuthError extends HttpError {
  constructor(readonly code: GoogleAuthErrorCode) {
    super('認証手続きを完了できません。もう一度ログインしてください。', code === 'operation_failed' ? 503 : 401)
    this.name = 'GoogleAuthError'
  }
}

// DB例外にはbind値を含む場合があるため、causeもログも残さない。
export async function authOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof HttpError) throw error
    throw new GoogleAuthError(error instanceof z.ZodError ? 'invalid_input' : 'operation_failed')
  }
}
export const opaque = z.string().min(1).max(512).refine(value => value.trim().length > 0)
export const secret = z.string().min(32).max(512)
export const verifiedIdentitySchema = z.object({ issuer: z.literal('https://accounts.google.com'), subject: opaque, email: z.string().email() })
export type VerifiedGoogleIdentity = z.infer<typeof verifiedIdentitySchema>
export const claimSchema = z.object({ attemptId: opaque, claimId: opaque, sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) })
export type OAuthClaim = z.infer<typeof claimSchema>
export function randomSecret(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)))
}
function hex(bytes: Uint8Array): string { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') }
export async function hashSecret(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}
export function expiresIn(now: string, milliseconds: number) { return new Date(Date.parse(now) + milliseconds).toISOString() }
export async function atomicAuth(db: D1DatabaseLike, statements: D1PreparedStatementLike[]) {
  const results = await db.batch(statements)
  if (results.some(result => !result.success)) throw new GoogleAuthError('operation_failed')
  return results
}
export function completeAttempt(db: D1DatabaseLike, now: string, claim: OAuthClaim, identity: VerifiedGoogleIdentity) {
  return db.prepare(`UPDATE oauth_login_attempts SET status='completed',nonce=NULL,code_verifier=NULL,
    verified_issuer=?,verified_subject=?,completed_at=?
    WHERE id=? AND claim_id=? AND sequence=? AND status='processing'
    AND julianday(expires_at)>julianday(?) AND julianday(expires_at)>julianday('now')`)
    .bind(identity.issuer, identity.subject, now, claim.attemptId, claim.claimId, claim.sequence, now)
}
