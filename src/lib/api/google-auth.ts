import 'server-only'
import * as attempts from '../../../cloudflare/worker/src/oauth-attempts'
import * as login from '../../../cloudflare/worker/src/google-login'
import * as migrations from '../../../cloudflare/worker/src/google-migrations'
import * as revocation from '../../../cloudflare/worker/src/google-revocation'
import { authOperation, GoogleAuthError } from '../../../cloudflare/worker/src/google-auth-shared'
import { getDatabase, getRuntime, isWorkerApiMockEnabled } from './backend'

export { GoogleAuthError }
export type { OAuthClaim, VerifiedGoogleIdentity } from '../../../cloudflare/worker/src/google-auth-shared'

function database() {
  // Google用UIモックは次段階で接続する。未実装時に実D1へ落とさない。
  if (isWorkerApiMockEnabled()) throw new GoogleAuthError('operation_failed')
  return getDatabase()
}
export function createOAuthAttempt(input: Parameters<typeof attempts.createOAuthAttempt>[2]) {
  return authOperation(() => attempts.createOAuthAttempt(database(), getRuntime(), input))
}
export function claimOAuthAttempt(input: Parameters<typeof attempts.claimOAuthAttempt>[2]) {
  return authOperation(() => attempts.claimOAuthAttempt(database(), getRuntime(), input))
}
export function failOAuthAttempt(claim: Parameters<typeof attempts.failOAuthAttempt>[2]) {
  return authOperation(() => attempts.failOAuthAttempt(database(), getRuntime(), claim))
}
export function completeGoogleLogin(claim: Parameters<typeof login.completeGoogleLogin>[2], identity: Parameters<typeof login.completeGoogleLogin>[3]) {
  return authOperation(() => login.completeGoogleLogin(database(), getRuntime(), claim, identity))
}
export function getGoogleMigrationRequest(requestId: string, browserSecret: string) {
  return authOperation(() => migrations.getGoogleMigrationRequest(database(), getRuntime(), requestId, browserSecret))
}
export function revokeGoogleSessions(token: string) {
  return authOperation(() => revocation.revokeGoogleSessions(database(), getRuntime(), token))
}
