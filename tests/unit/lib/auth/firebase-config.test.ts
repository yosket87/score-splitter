import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firebaseAuthConfig, matchesFirebaseOrigin } from '@/lib/auth/firebase-config'

vi.mock('server-only', () => ({}))

describe('Firebase設定', () => {
  beforeEach(() => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'yamawake-dev')
    vi.stubEnv('FIREBASE_API_KEY', 'public-key')
    vi.stubEnv('FIREBASE_AUTH_DOMAIN', 'yamawake-dev.firebaseapp.com')
    vi.stubEnv('FIREBASE_AUTH_ORIGIN', 'https://dev.example.com')
    vi.stubEnv('FIREBASE_GOOGLE_ENABLED', 'true')
    vi.stubEnv('FIREBASE_APPLE_ENABLED', 'false')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('公開設定と個別provider設定を返し、毎回設定を読み直す', () => {
    expect(firebaseAuthConfig()).toEqual({
      origin: 'https://dev.example.com',
      client: { projectId: 'yamawake-dev', apiKey: 'public-key', authDomain: 'yamawake-dev.firebaseapp.com',
        googleEnabled: true, appleEnabled: false },
    })
    vi.stubEnv('FIREBASE_APPLE_ENABLED', 'true')
    expect(firebaseAuthConfig()?.client.appleEnabled).toBe(true)
  })
  it.each(['FIREBASE_PROJECT_ID', 'FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_ORIGIN'])('%s不足なら無効', key => {
    vi.stubEnv(key, '')
    expect(firebaseAuthConfig()).toBeNull()
  })
  it.each(['http://dev.example.com', 'https://dev.example.com/', 'https://dev.example.com/path', 'https://user@dev.example.com'])('不正origin %sを拒否', origin => {
    vi.stubEnv('FIREBASE_AUTH_ORIGIN', origin)
    expect(firebaseAuthConfig()).toBeNull()
  })
  it('localhostは開発Nodeのみ許可する', () => {
    vi.stubEnv('FIREBASE_AUTH_ORIGIN', 'http://localhost:3000')
    vi.stubEnv('NODE_ENV', 'production')
    expect(firebaseAuthConfig()).toBeNull()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    expect(firebaseAuthConfig()).not.toBeNull()
  })
  it('他projectのauthDomainと不正hostnameを拒否する', () => {
    vi.stubEnv('FIREBASE_AUTH_DOMAIN', 'other.firebaseapp.com')
    expect(firebaseAuthConfig()).toBeNull()
    vi.stubEnv('FIREBASE_AUTH_DOMAIN', 'https://yamawake-dev.firebaseapp.com')
    expect(firebaseAuthConfig()).toBeNull()
  })
  it('本番projectとoriginの組合せで独自authDomainを許可する', () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', 'yamawake-prod')
    vi.stubEnv('FIREBASE_AUTH_DOMAIN', 'auth.yamawake.app')
    vi.stubEnv('FIREBASE_AUTH_ORIGIN', 'https://app.yamawake.app')
    expect(firebaseAuthConfig()).toEqual({
      origin: 'https://app.yamawake.app',
      client: { projectId: 'yamawake-prod', apiKey: 'public-key', authDomain: 'auth.yamawake.app',
        googleEnabled: true, appleEnabled: false },
    })
  })
  it.each([
    ['yamawake-dev', 'auth.yamawake.app', 'https://app.yamawake.app'],
    ['yamawake-prod', 'other.example.com', 'https://app.yamawake.app'],
    ['yamawake-prod', 'auth.yamawake.app.evil.example', 'https://app.yamawake.app'],
    ['yamawake-prod', 'auth.yamawake.app', 'https://preview.yamawake.app'],
    ['yamawake-prod', 'auth.yamawake.app', 'https://app.yamawake.app:8443'],
    ['yamawake-prod', 'auth.yamawake.app', 'https://app.yamawake.app/'],
  ])('独自domainの許可組合せと異なる設定 %s / %s / %s を拒否する', (projectId, authDomain, origin) => {
    vi.stubEnv('FIREBASE_PROJECT_ID', projectId)
    vi.stubEnv('FIREBASE_AUTH_DOMAIN', authDomain)
    vi.stubEnv('FIREBASE_AUTH_ORIGIN', origin)
    expect(firebaseAuthConfig()).toBeNull()
  })
  it('providerが全て無効なら設定も無効', () => {
    vi.stubEnv('FIREBASE_GOOGLE_ENABLED', 'false')
    expect(firebaseAuthConfig()).toBeNull()
  })
  it('OriginとHostが固定originへ一致する場合だけ許可する', () => {
    const config = firebaseAuthConfig()!
    expect(matchesFirebaseOrigin(new Headers({ origin: config.origin, host: 'dev.example.com' }), config)).toBe(true)
    expect(matchesFirebaseOrigin(new Headers({ host: 'dev.example.com' }), config)).toBe(false)
    expect(matchesFirebaseOrigin(new Headers({ origin: config.origin, host: 'preview.example.com' }), config)).toBe(false)
    expect(matchesFirebaseOrigin(new Headers({ origin: 'https://other.example.com', host: 'dev.example.com' }), config)).toBe(false)
  })
})
