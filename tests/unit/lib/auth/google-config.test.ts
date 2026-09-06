import { afterEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { googleOAuthConfig } from '@/lib/auth/google-config'
afterEach(() => vi.unstubAllEnvs())
it.each([undefined, '', 'https://app.example.com/path', 'https://app.example.com/', 'http://app.example.com', 'bad-url'])('不正origin %s ではGoogleを有効にしない', origin => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'secret'); vi.stubEnv('GOOGLE_OAUTH_ORIGIN', origin)
  expect(googleOAuthConfig()).toBeNull()
})
it('secret不足はモックへfallbackしない', () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('USE_MOCKS', 'true'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', undefined); vi.stubEnv('GOOGLE_OAUTH_ORIGIN', 'https://app.example.com')
  expect(googleOAuthConfig()).toBeNull()
})
it('developmentの全条件一致時だけローカル固定設定を使う', () => {
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEXT_RUNTIME', 'nodejs'); vi.stubEnv('USE_MOCKS', 'true')
  expect(googleOAuthConfig()?.redirectUri).toBe('http://localhost:3000/api/auth/google/callback')
})

it('ローカル実OAuthはdevelopment Nodeの正確なlocalhostだけを許可する', () => {
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEXT_RUNTIME', 'nodejs'); vi.stubEnv('USE_MOCKS', 'false')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'real-client'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'real-secret')
  vi.stubEnv('GOOGLE_OAUTH_ORIGIN', 'http://localhost:3000')
  expect(googleOAuthConfig()?.redirectUri).toBe('http://localhost:3000/api/auth/google/callback')
  for (const origin of ['http://localhost:3001', 'http://127.0.0.1:3000', 'http://localhost:3000/']) {
    vi.stubEnv('GOOGLE_OAUTH_ORIGIN', origin)
    expect(googleOAuthConfig()).toBeNull()
  }
  vi.stubEnv('GOOGLE_OAUTH_ORIGIN', 'http://localhost:3000'); vi.stubEnv('NODE_ENV', 'production')
  expect(googleOAuthConfig()).toBeNull()
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEXT_RUNTIME', 'edge')
  expect(googleOAuthConfig()).toBeNull()
})
