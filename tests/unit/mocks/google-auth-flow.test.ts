import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { initStore } from '@/mocks/db'
import * as api from '@/mocks/google-auth'
import { createGoogleAuthorizationRequest, verifyGoogleCallback } from '@/lib/auth/google-protocol'
import { localAuthorization, authorizeGoogleMock, mockGoogleFetch } from '@/mocks/google-provider'
beforeAll(async () => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('ArrayBuffer', (await webcrypto.subtle.digest('SHA-256', new Uint8Array())).constructor) })
afterAll(() => vi.unstubAllGlobals())
it('同ブラウザで本人失効後に未知主体の申請を開始できる', async () => {
  initStore()
  const config = { clientId: 'local-google-client', clientSecret: 'local-google-secret', redirectUri: 'http://localhost:3000/api/auth/google/callback' }
  async function login(scenario: string) {
    api.prepareGoogleScenario(scenario)
    const authorization = await createGoogleAuthorizationRequest(config)
    const attempt = await api.createOAuthAttempt({ ...authorization, browserBinding: 'b'.repeat(64) })
    const claim = await api.claimOAuthAttempt({ attemptId: attempt.attemptId, state: authorization.state, browserBinding: 'b'.repeat(64) })
    const local = new URL(localAuthorization(authorization.authorizationUrl, scenario))
    const identity = await verifyGoogleCallback(config, authorizeGoogleMock(local.searchParams.get('request')!), authorization, { fetch: mockGoogleFetch })
    return api.completeGoogleLogin(claim, { ...identity, issuer: 'https://accounts.google.com' })
  }
  const a = await login('member-a')
  if (a.kind !== 'authenticated') throw new Error('認証が必要')
  await api.revokeGoogleSessions(a.session.token)
  expect((await login('pending-a')).kind).toBe('migration_pending')
})
