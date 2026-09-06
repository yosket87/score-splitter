import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const backend = vi.hoisted(() => ({ getDatabase: vi.fn(), getRuntime: vi.fn(), isWorkerApiMockEnabled: vi.fn() }))
vi.mock('@/lib/api/backend', () => backend)
import { createOAuthAttempt } from '@/lib/api/google-auth'
import { createIdentitySqlite } from '../../../helpers/identity-sqlite'
import { createRuntime } from '../../../../cloudflare/worker/src/d1'
import { webcrypto } from 'node:crypto'

describe('Google adapterの実D1とUIモック境界', () => {
  beforeEach(() => { vi.clearAllMocks(); backend.isWorkerApiMockEnabled.mockReturnValue(false) })
  const input = { state: 's'.repeat(43), nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43), browserBinding: 'b'.repeat(64) }
  it('UIモック時は実D1 bindingを取得せず専用Storeを使う', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(true)
    await expect(createOAuthAttempt(input)).resolves.toMatchObject({ attemptId: expect.any(String) })
    expect(backend.getDatabase).not.toHaveBeenCalled()
  })
  it('binding取得例外の内部情報を外へ渡さない', async () => {
    backend.getDatabase.mockImplementation(() => { throw new Error('binding-secret-fixture') })
    const error = await createOAuthAttempt(input).catch(error => error)
    expect(error.code).toBe('operation_failed')
    expect(error.cause).toBeUndefined()
    expect(String(error)).not.toContain('binding-secret-fixture')
  })
  it('呼出時に取得した実D1とRuntimeへ渡す', async () => {
    const store = createIdentitySqlite({ fixture: false })
    vi.stubGlobal('crypto', webcrypto)
    try {
      backend.getDatabase.mockReturnValue(store.db)
      backend.getRuntime.mockReturnValue(createRuntime())
      const created = await createOAuthAttempt(input)
      expect(store.sqlite.prepare('SELECT status FROM oauth_login_attempts WHERE id=?').get(created.attemptId)?.status).toBe('pending')
    } finally { store.sqlite.close(); vi.unstubAllGlobals() }
  })
})
