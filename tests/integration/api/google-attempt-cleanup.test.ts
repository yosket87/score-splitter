import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
vi.mock('server-only', () => ({}))
const backend = vi.hoisted(() => ({ getDatabase: vi.fn(), getRuntime: vi.fn(), isWorkerApiMockEnabled: vi.fn(() => false) }))
vi.mock('@/lib/api/backend', () => backend)
import { GET as start } from '@/app/api/auth/google/start/route'
import { createOAuthAttempt, claimOAuthAttempt } from '../../../cloudflare/worker/src/oauth-attempts'
import { createRuntime } from '../../../cloudflare/worker/src/d1'
import { createIdentitySqlite } from '../../helpers/identity-sqlite'
let store: ReturnType<typeof createIdentitySqlite>
beforeEach(async () => {
  store = createIdentitySqlite({ fixture: false })
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('ArrayBuffer', (await webcrypto.subtle.digest('SHA-256', new Uint8Array())).constructor)
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'fixture-client')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'fixture-secret'); vi.stubEnv('GOOGLE_OAUTH_ORIGIN', 'https://app.example.com')
  backend.getDatabase.mockReturnValue(store.db)
})
afterEach(() => { store.sqlite.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks() })
async function fixtures() {
  const clock = Date.now(), runtime = createRuntime()
  for (const age of [0, 5]) for (const status of ['pending', 'processing']) {
    const input = { state: crypto.randomUUID() + 'state-padding', nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43), browserBinding: 'b'.repeat(64) }
    const fixtureRuntime = { ...runtime, now: () => new Date(clock + age * 60000), randomUUID: () => `${age}-${status}` }
    const created = await createOAuthAttempt(store.db, fixtureRuntime, input)
    if (status === 'processing') await claimOAuthAttempt(store.db, { ...fixtureRuntime, randomUUID: () => crypto.randomUUID() }, { ...input, attemptId: created.attemptId })
  }
  backend.getRuntime.mockReturnValue({ ...runtime, now: () => new Date(clock + 11 * 60000) })
}
it('正規startは期限切れpending/processingの秘密を消し未期限の両状態を保持する', async () => {
  await fixtures()
  const result = await start(new NextRequest('https://app.example.com/api/auth/google/start'))
  expect(result.status).toBe(303)
  expect(new URL(result.headers.get('location')!).origin).toBe('https://accounts.google.com')
  for (const status of ['pending', 'processing']) {
    expect(store.sqlite.prepare('SELECT status,nonce,code_verifier FROM oauth_login_attempts WHERE id=?').get(`0-${status}`))
      .toEqual({ status: 'expired', nonce: null, code_verifier: null })
    expect(store.sqlite.prepare('SELECT status,nonce,code_verifier FROM oauth_login_attempts WHERE id=?').get(`5-${status}`))
      .toEqual({ status, nonce: 'n'.repeat(43), code_verifier: 'v'.repeat(43) })
  }
})
it('Previewは清掃も試行作成もせず保存済みの全値を保持する', async () => {
  await fixtures()
  const before = store.sqlite.prepare('SELECT * FROM oauth_login_attempts ORDER BY sequence').all()
  const result = await start(new NextRequest('https://preview.example.com/api/auth/google/start'))
  expect(result.status).toBe(400)
  expect(store.sqlite.prepare('SELECT * FROM oauth_login_attempts ORDER BY sequence').all()).toEqual(before)
  expect(backend.getDatabase).not.toHaveBeenCalled()
})
