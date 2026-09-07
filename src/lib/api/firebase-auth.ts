import 'server-only'
import { completeFirebaseLogin as completeLogin } from '../../../cloudflare/worker/src/firebase-login'
import { getFirebaseAccount as getAccount } from '../../../cloudflare/worker/src/firebase-account'
import { revokeFirebaseSessions as revokeSessions } from '../../../cloudflare/worker/src/firebase-revocation'
import { getFirebaseMigrationDisplay as getDisplay } from '../../../cloudflare/worker/src/firebase-migrations'
import { authOperation } from '../../../cloudflare/worker/src/google-auth-shared'
import { getDatabase, getRuntime } from './backend'
import { isFirebaseMockEnabled } from '@/lib/mock-mode'

export function completeFirebaseLogin(...args: Parameters<typeof completeLogin> extends [unknown, unknown, ...infer T] ? T : never) {
  return authOperation(async () => {
    if (isFirebaseMockEnabled()) return (await import('@/mocks/firebase-auth')).completeMockFirebaseLogin(...args)
    return completeLogin(getDatabase(), getRuntime(), ...args)
  })
}
export function getFirebaseAccount(token: string) {
  return authOperation(async () => isFirebaseMockEnabled() ? (await import('@/mocks/firebase-auth')).getMockFirebaseAccount(token) : getAccount(getDatabase(), token))
}
export function revokeFirebaseSessions(token: string) {
  return authOperation(async () => isFirebaseMockEnabled() ? (await import('@/mocks/firebase-auth')).revokeMockFirebaseSessions(token) : revokeSessions(getDatabase(), getRuntime(), token))
}
export function getFirebaseMigrationDisplay(id: string, secret: string, code: string) {
  return authOperation(async () => isFirebaseMockEnabled() ? (await import('@/mocks/firebase-auth')).getMockFirebaseMigrationDisplay(id, secret, code) : getDisplay(getDatabase(), getRuntime(), id, secret, code))
}
