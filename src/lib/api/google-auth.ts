import 'server-only'
import * as attempts from '../../../cloudflare/worker/src/oauth-attempts'
import * as login from '../../../cloudflare/worker/src/google-login'
import * as migrations from '../../../cloudflare/worker/src/google-migrations'
import * as account from '../../../cloudflare/worker/src/google-account'
import * as revocation from '../../../cloudflare/worker/src/google-revocation'
import { authOperation, GoogleAuthError } from '../../../cloudflare/worker/src/google-auth-shared'
import { getDatabase, getRuntime, isWorkerApiMockEnabled } from './backend'

export { GoogleAuthError }
export type { OAuthClaim, VerifiedGoogleIdentity } from '../../../cloudflare/worker/src/google-auth-shared'

export function createOAuthAttempt(input: Parameters<typeof attempts.createOAuthAttempt>[2]) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).createOAuthAttempt(input)
    return attempts.createOAuthAttempt(getDatabase(), getRuntime(), input)
  })
}
export function claimOAuthAttempt(input: Parameters<typeof attempts.claimOAuthAttempt>[2]) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).claimOAuthAttempt(input)
    return attempts.claimOAuthAttempt(getDatabase(), getRuntime(), input)
  })
}
export function failOAuthAttempt(claim: Parameters<typeof attempts.failOAuthAttempt>[2]) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).failOAuthAttempt(claim)
    return attempts.failOAuthAttempt(getDatabase(), getRuntime(), claim)
  })
}
export function completeGoogleLogin(claim: Parameters<typeof login.completeGoogleLogin>[2], identity: Parameters<typeof login.completeGoogleLogin>[3]) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).completeGoogleLogin(claim, identity)
    return login.completeGoogleLogin(getDatabase(), getRuntime(), claim, identity)
  })
}
export function getGoogleMigrationRequest(requestId: string, browserSecret: string) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).getGoogleMigrationRequest(requestId, browserSecret)
    return migrations.getGoogleMigrationRequest(getDatabase(), getRuntime(), requestId, browserSecret)
  })
}
export function revokeGoogleSessions(token: string) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).revokeGoogleSessions(token)
    return revocation.revokeGoogleSessions(getDatabase(), getRuntime(), token)
  })
}

export function getGoogleAccount(token: string) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).getGoogleAccount(token)
    return account.getGoogleAccount(getDatabase(), token)
  })
}
export function getGoogleMigrationDisplay(requestId: string, browserSecret: string, code: string) {
  return authOperation(async () => {
    if (isWorkerApiMockEnabled()) return (await import('@/mocks/google-auth')).getGoogleMigrationDisplay(requestId, browserSecret, code)
    return account.getGoogleMigrationDisplay(getDatabase(), getRuntime(), requestId, browserSecret, code)
  })
}
