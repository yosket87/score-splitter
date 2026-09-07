import { webcrypto } from 'node:crypto'
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import { createGoogleAuthorizationRequest, verifyGoogleCallback } from '@/lib/auth/google-protocol'
import { localAuthorization, authorizeGoogleMock, mockGoogleFetch } from '@/mocks/google-provider'
beforeAll(async () => { vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('ArrayBuffer', (await webcrypto.subtle.digest('SHA-256', new Uint8Array())).constructor) })
afterAll(() => vi.unstubAllGlobals())
const config = { clientId: 'local-google-client', clientSecret: 'local-google-secret', redirectUri: 'http://localhost:3000/api/auth/google/callback' }
it('疑似GoogleもPKCEと署名検証を通しcodeを一度だけ使う', async () => {
  const attempt = await createGoogleAuthorizationRequest(config)
  const local = new URL(localAuthorization(attempt.authorizationUrl, 'member-a'))
  const callback = authorizeGoogleMock(local.searchParams.get('request')!)
  const result = await verifyGoogleCallback(config, callback, attempt, { fetch: mockGoogleFetch })
  expect(result.subject).toBe('member-a')
  await expect(verifyGoogleCallback(config, callback, attempt, { fetch: mockGoogleFetch })).rejects.toMatchObject({ code: 'invalid_token' })
})
