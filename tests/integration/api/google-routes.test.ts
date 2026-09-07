import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
vi.mock('server-only', () => ({}))
const api = vi.hoisted(() => ({ expireOAuthAttempts: vi.fn(), createOAuthAttempt: vi.fn(), claimOAuthAttempt: vi.fn(), failOAuthAttempt: vi.fn(), completeGoogleLogin: vi.fn() }))
vi.mock('@/lib/api/google-auth', () => api)
const verify = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/google-protocol', async importOriginal => ({ ...await importOriginal<object>(), verifyGoogleCallback: verify }))
import { GET as start } from '@/app/api/auth/google/start/route'
import { GET as callback } from '@/app/api/auth/google/callback/route'
beforeEach(async () => {
  vi.stubGlobal('ArrayBuffer', (await webcrypto.subtle.digest('SHA-256', new Uint8Array())).constructor)
  vi.stubGlobal('crypto', webcrypto); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('USE_MOCKS', 'true')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'fixture-client'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'fixture-secret')
  vi.stubEnv('GOOGLE_OAUTH_ORIGIN', 'https://app.example.com')
  vi.clearAllMocks(); api.expireOAuthAttempts.mockResolvedValue(undefined); api.failOAuthAttempt.mockResolvedValue(undefined); api.createOAuthAttempt.mockResolvedValue({ attemptId: 'attempt', expiresAt: new Date(Date.now() + 600000).toISOString() })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('許可originではmock入力を無視してGoogleへ遷移し秘密値はCookieへ入れない', async () => {
  const result = await start(new NextRequest('https://app.example.com/api/auth/google/start?mock=1&sub=attacker', { headers: { cookie: 'google_mock_scenario=member-a' } }))
  expect(result.status).toBe(303)
  expect(new URL(result.headers.get('location')!).origin).toBe('https://accounts.google.com')
  expect(api.createOAuthAttempt).toHaveBeenCalledOnce()
  expect(api.expireOAuthAttempts.mock.invocationCallOrder[0]).toBeLessThan(api.createOAuthAttempt.mock.invocationCallOrder[0])
  const cookie = result.cookies.get('google_oauth_attempt')!
  expect(cookie.value).not.toContain(api.createOAuthAttempt.mock.calls[0][0].nonce)
  expect(cookie.value).not.toContain(api.createOAuthAttempt.mock.calls[0][0].codeVerifier)
  expect(result.headers.get('set-cookie')).toMatch(/HttpOnly/)
  expect(result.headers.get('referrer-policy')).toBe('no-referrer')
})
it('動的Previewは有効設定でも試行作成前に拒否する', async () => {
  const result = await start(new NextRequest('https://preview.example.com/api/auth/google/start'))
  expect(result.status).toBe(400)
  expect(api.createOAuthAttempt).not.toHaveBeenCalled()
  expect(api.expireOAuthAttempts).not.toHaveBeenCalled()
  expect(result.headers.get('location')).toBeNull()
})
it('Cookieなしcallbackは交換せず固定エラーへ戻す', async () => {
  const result = await callback(new NextRequest('https://app.example.com/api/auth/google/callback?code=secret&state=state'))
  expect(result.headers.get('location')).toBe('https://app.example.com/login?google=error')
  expect(verify).not.toHaveBeenCalled()
  expect(api.claimOAuthAttempt).not.toHaveBeenCalled()
})

vi.mock('@/lib/webauthn/session', () => ({ setGoogleSessionCookie: vi.fn() }))
import { setGoogleSessionCookie } from '@/lib/webauthn/session'
function validCallback() {
  return new NextRequest('https://app.example.com/api/auth/google/callback?code=provider-code&state=provider-state&iss=https%3A%2F%2Faccounts.google.com', {
    headers: { cookie: `google_oauth_attempt=${encodeURIComponent(JSON.stringify({ id: 'attempt', binding: 'a'.repeat(64) }))}; household_session=${'c'.repeat(64)}` },
  })
}
it('claim失敗はtoken交換へ進まずCookieを消す', async () => {
  api.claimOAuthAttempt.mockRejectedValueOnce(new Error('fixture-state-secret'))
  const result = await callback(validCallback())
  expect(verify).not.toHaveBeenCalled()
  expect(result.cookies.get('google_oauth_attempt')?.value).toBe('')
  expect(result.headers.get('location')).not.toContain('fixture-state-secret')
})
it('session Cookieは原子的な認証成功後にのみ発行する', async () => {
  api.claimOAuthAttempt.mockResolvedValueOnce({ attemptId: 'attempt', claimId: 'claim', sequence: 1, nonce: 'nonce', codeVerifier: 'v'.repeat(43) })
  verify.mockResolvedValueOnce({ issuer: 'https://accounts.google.com', subject: 'member-a', email: 'a@example.com' })
  const session = { token: 'a'.repeat(64), authMethod: 'google' }
  api.completeGoogleLogin.mockResolvedValueOnce({ kind: 'authenticated', session })
  const result = await callback(validCallback())
  expect(result.headers.get('location')).toBe('https://app.example.com/')
  expect(setGoogleSessionCookie).toHaveBeenCalledWith(session)
  expect(api.completeGoogleLogin.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(setGoogleSessionCookie).mock.invocationCallOrder[0])
})
it.each(['migration_pending', 'recovered'])('%sは以前の家計Cookieを消し個人認証と混ぜない', async kind => {
  api.claimOAuthAttempt.mockResolvedValueOnce({ attemptId: 'attempt', claimId: 'claim', sequence: 1, nonce: 'nonce', codeVerifier: 'v'.repeat(43) })
  verify.mockResolvedValueOnce({ issuer: 'https://accounts.google.com', subject: 'new', email: 'new@example.com' })
  api.completeGoogleLogin.mockResolvedValueOnce({ kind, requestId: 'request', code: 'b'.repeat(64), browserSecret: 'c'.repeat(64) })
  const result = await callback(validCallback())
  expect(setGoogleSessionCookie).not.toHaveBeenCalled()
  expect(result.cookies.get('household_session')?.value).toBe('')
  expect(result.headers.get('location')).toBe(`https://app.example.com/${kind === 'recovered' ? 'login?google=recovered' : 'auth/migration'}`)
})
it('DB失敗時は安全なURLへ戻しsessionを発行しない', async () => {
  api.claimOAuthAttempt.mockResolvedValueOnce({ attemptId: 'attempt', claimId: 'claim', sequence: 1, nonce: 'nonce', codeVerifier: 'v'.repeat(43) })
  verify.mockResolvedValueOnce({ issuer: 'https://accounts.google.com', subject: 'a', email: 'a@example.com' })
  api.completeGoogleLogin.mockRejectedValueOnce(new Error('D1 code=secret'))
  const result = await callback(validCallback())
  expect(setGoogleSessionCookie).not.toHaveBeenCalled()
  expect(api.failOAuthAttempt).toHaveBeenCalledOnce()
  expect(result.headers.get('location')).toBe('https://app.example.com/login?google=error')
})
