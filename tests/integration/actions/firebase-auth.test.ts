import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ config: vi.fn(), verify: vi.fn(), account: vi.fn(), complete: vi.fn(), revoke: vi.fn(),
  setSession: vi.fn(), cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }, headers: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => mocks.cookies, headers: mocks.headers }))
vi.mock('@/lib/auth/firebase-config', async importOriginal => ({ ...await importOriginal<object>(), firebaseAuthConfig: mocks.config }))
vi.mock('@/lib/auth/firebase-token', () => ({ verifyFirebaseToken: mocks.verify }))
vi.mock('@/lib/api/firebase-auth', () => ({ getFirebaseAccount: mocks.account, completeFirebaseLogin: mocks.complete, revokeFirebaseSessions: mocks.revoke }))
vi.mock('@/lib/webauthn/session', () => ({ setFirebaseSessionCookie: mocks.setSession }))
import { exchangeFirebaseSession, logoutAllFirebaseSessions } from '@/app/actions/firebase-auth'

const config = { origin: 'https://dev.example.com', client: { projectId: 'yamawake-dev', apiKey: 'key', authDomain: 'yamawake-dev.firebaseapp.com', googleEnabled: true, appleEnabled: false } }
const identity = { projectId: 'yamawake-dev', uid: 'uid-1', provider: 'google.com', email: null, authTime: 1788739200, issuedAt: 1788739200, expiresAt: 1788742800 }

describe('Firebase認証Action', () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(identity.issuedAt * 1000))
    mocks.config.mockReturnValue(config)
    mocks.headers.mockResolvedValue(new Headers({ origin: config.origin, host: 'dev.example.com' }))
    mocks.verify.mockResolvedValue(identity)
    mocks.account.mockResolvedValue(null)
    mocks.complete.mockResolvedValue({ kind: 'authenticated', session: { token: 'a'.repeat(64) } })
  })
  afterEach(() => vi.useRealTimers())
  it('署名検証→本人確認→DB確定後にCookieを設定する', async () => {
    expect(await exchangeFirebaseSession('signed-token', 'login')).toEqual({ ok: true, destination: '/' })
    expect(mocks.complete).toHaveBeenCalledWith(identity, { mode: 'login', currentToken: undefined })
    expect(mocks.setSession).toHaveBeenCalledOnce()
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0])
    expect(mocks.complete.mock.invocationCallOrder[0]).toBeLessThan(mocks.setSession.mock.invocationCallOrder[0])
  })
  it('設定不足・異originでは外部検証さえ呼ばない', async () => {
    mocks.config.mockReturnValue(null)
    expect((await exchangeFirebaseSession('token', 'login')).ok).toBe(false)
    mocks.config.mockReturnValue(config)
    mocks.headers.mockResolvedValue(new Headers({ origin: 'https://other.example.com', host: 'dev.example.com' }))
    expect((await exchangeFirebaseSession('token', 'login')).ok).toBe(false)
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('検証失敗やDB失敗でCookieを発行せず機密を返さない', async () => {
    mocks.verify.mockRejectedValueOnce(new Error('token=SECRET'))
    const failed = await exchangeFirebaseSession('token', 'login')
    expect(failed.ok).toBe(false); expect(JSON.stringify(failed)).not.toContain('SECRET')
    mocks.complete.mockRejectedValueOnce(new Error('D1 SECRET'))
    expect((await exchangeFirebaseSession('token', 'login')).ok).toBe(false)
    expect(mocks.setSession).not.toHaveBeenCalled()
  })
  it('無効providerや古い初回認証を拒否する', async () => {
    mocks.verify.mockResolvedValueOnce({ ...identity, provider: 'apple.com' })
    expect((await exchangeFirebaseSession('token', 'login')).ok).toBe(false)
    mocks.verify.mockResolvedValueOnce({ ...identity, authTime: identity.authTime - 301 })
    expect((await exchangeFirebaseSession('token', 'login')).ok).toBe(false)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('更新は有効Cookieの同UIDだけ', async () => {
    mocks.cookies.get.mockReturnValue({ value: 'current-cookie' })
    mocks.account.mockResolvedValueOnce({ projectId: identity.projectId, uid: 'other' })
    expect((await exchangeFirebaseSession('token', 'refresh')).ok).toBe(false)
    mocks.account.mockResolvedValueOnce({ projectId: identity.projectId, uid: identity.uid })
    mocks.verify.mockResolvedValueOnce({ ...identity, authTime: identity.authTime - 1000 })
    expect((await exchangeFirebaseSession('token', 'refresh')).ok).toBe(true)
  })
  it('未承認者にはsessionを発行せずbrowser用申請Cookieだけを返す', async () => {
    mocks.complete.mockResolvedValue({ kind: 'migration_pending', requestId: 'request', browserSecret: 'b'.repeat(64), code: 'c'.repeat(64), expiresAt: new Date((identity.issuedAt + 600) * 1000).toISOString() })
    expect(await exchangeFirebaseSession('token', 'login')).toEqual({ ok: true, destination: '/auth/migration' })
    expect(mocks.setSession).not.toHaveBeenCalled()
    expect(mocks.cookies.set).toHaveBeenCalledWith('firebase_migration_request', expect.any(String), expect.objectContaining({ httpOnly: true, maxAge: 600 }))
  })
  it('全端末ログアウトはDB失効成功後だけCookieを消す', async () => {
    mocks.cookies.get.mockReturnValue({ value: 'session' })
    mocks.revoke.mockRejectedValueOnce(new Error('DB failure'))
    expect((await logoutAllFirebaseSessions()).ok).toBe(false)
    expect(mocks.cookies.delete).not.toHaveBeenCalled()
    expect((await logoutAllFirebaseSessions()).ok).toBe(true)
    expect(mocks.cookies.delete).toHaveBeenCalledWith('household_session')
  })
})
