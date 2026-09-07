import { webcrypto } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createFirebaseTokenVerifierForTesting, verifyFirebaseToken, FirebaseVerificationError } from '@/lib/auth/firebase-token'
import { createFirebaseFixtureFetch, createFirebaseTokenFixture, firebaseFixtureConfig, firebaseFixtureNow } from '../../helpers/firebase-token'

beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto)
  const buffer = await webcrypto.subtle.digest('SHA-256', new Uint8Array())
  vi.stubGlobal('ArrayBuffer', buffer.constructor)
})
afterAll(() => vi.unstubAllGlobals())

function setup(options: Parameters<typeof createFirebaseFixtureFetch>[0] = {}) {
  const fixture = createFirebaseFixtureFetch(options)
  const clock = { now: firebaseFixtureNow * 1000 }
  const verify = createFirebaseTokenVerifierForTesting({ fetch: fixture.fetch, now: () => clock.now })
  return { ...fixture, clock, verify }
}

describe('Firebase IDトークン検証', () => {
  it.each([123, null, {}, []].map(email => ({ email })))('emailが存在する場合は文字列だけを受け付ける: %j', async ({ email }) => {
    await expect(setup().verify(await createFirebaseTokenFixture({ claims: { email } }), firebaseFixtureConfig)).rejects.toThrow()
  })
  it('鍵更新失敗後も再取得を30秒抑制する', async () => {
    const fixture = createFirebaseFixtureFetch()
    let now = firebaseFixtureNow * 1000
    let keyRequests = 0
    const verify = createFirebaseTokenVerifierForTesting({ now: () => now, fetch: async (url, init) => {
      if (String(url).includes('/x509/') && ++keyRequests > 1) return new Response('', { status: 503 })
      return fixture.fetch(url, init)
    } })
    await verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)
    now += 30000
    const unknown = await createFirebaseTokenFixture({ header: { kid: 'unknown' } })
    await expect(verify(unknown, firebaseFixtureConfig)).rejects.toThrow()
    await expect(verify(unknown, firebaseFixtureConfig)).rejects.toThrow()
    expect(keyRequests).toBe(2)
    now += 30000
    await expect(verify(unknown, firebaseFixtureConfig)).rejects.toThrow()
    expect(keyRequests).toBe(3)
  })
  it('実RS256署名とアカウントを検証する', async () => {
    const { verify, requests } = setup()
    const token = await createFirebaseTokenFixture()
    expect(await verify(token, firebaseFixtureConfig)).toEqual({
      projectId: 'fixture-project', uid: 'firebase-uid-123', provider: 'google.com', email: 'person@example.com',
      authTime: firebaseFixtureNow - 20, issuedAt: firebaseFixtureNow - 10, expiresAt: firebaseFixtureNow + 3600,
    })
    expect(requests[1].init).toMatchObject({ method: 'POST', redirect: 'manual', body: JSON.stringify({ idToken: token }) })
  })
  it('Appleとメールなしを受け入れる', async () => {
    const token = await createFirebaseTokenFixture({ claims: { firebase: { sign_in_provider: 'apple.com' }, email: undefined } })
    expect(await setup().verify(token, firebaseFixtureConfig)).toMatchObject({ provider: 'apple.com', email: null })
  })
  it.each([
    { aud: 'another-project' }, { aud: ['fixture-project', 'another-project'] }, { iss: 'https://attacker.example' },
    { exp: firebaseFixtureNow }, { iat: firebaseFixtureNow + 1 }, { auth_time: firebaseFixtureNow + 1 },
    { auth_time: undefined }, { auth_time: '1' }, { iat: undefined }, { exp: undefined },
    { sub: '' }, { sub: 'x'.repeat(129) }, { sub: 123 }, { sub: 'bad\nuid' },
    { firebase: { sign_in_provider: 'password' } }, { firebase: { sign_in_provider: 'anonymous' } },
    { firebase: { sign_in_provider: 'google.com', tenant: 'tenant-a' } }, { firebase: null },
  ])('不正claimを拒否する: %j', async (claims) => {
    const { verify, requests } = setup()
    await expect(verify(await createFirebaseTokenFixture({ claims }), firebaseFixtureConfig)).rejects.toThrow()
    expect(requests.filter(r => r.url.includes('accounts:lookup'))).toHaveLength(0)
  })
  it.each([{ alg: 'none' }, { alg: 'HS256' }, { kid: 'unknown' }, { kid: undefined }])('ヘッダーを拒否する: %j', async (header) => {
    await expect(setup().verify(await createFirebaseTokenFixture({ header }), firebaseFixtureConfig)).rejects.toThrow()
  })
  it('改竄署名を拒否する', async () => {
    await expect(setup().verify(await createFirebaseTokenFixture({ invalidSignature: true }), firebaseFixtureConfig)).rejects.toThrow()
  })
  it.each(['', 'x'.repeat(16385), 'not.a.token'])('無効な入力を拒否する', async token => {
    await expect(setup().verify(token, firebaseFixtureConfig)).rejects.toThrow()
  })
  it.each([
    {}, { users: [] }, { users: [{ localId: 'other' }] },
    { users: [{ localId: 'firebase-uid-123' }, { localId: 'firebase-uid-123' }] },
    { users: [{ localId: 'firebase-uid-123', disabled: true }] },
    { users: [{ localId: 'firebase-uid-123', validSince: String(firebaseFixtureNow - 19) }] },
    { users: [{ localId: 'firebase-uid-123', validSince: 'not-a-time' }] },
    { users: [{ localId: 'firebase-uid-123', tenantId: 'tenant-a' }] },
  ])('lookup異常を拒否する: %j', async lookup => {
    await expect(setup({ lookup }).verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)).rejects.toThrow()
  })
  it('auth_timeとvalidSinceが同秒なら受け入れる', async () => {
    const { verify } = setup({ lookup: { users: [{ localId: 'firebase-uid-123', validSince: String(firebaseFixtureNow - 20) }] } })
    await expect(verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)).resolves.toBeDefined()
  })
  it('鍵のみ期限までキャッシュしlookupは毎回取得する', async () => {
    const { verify, requests, clock } = setup({ cacheControl: 'public, max-age=60', age: '10' })
    const token = await createFirebaseTokenFixture()
    await verify(token, firebaseFixtureConfig)
    clock.now += 49000
    await verify(token, firebaseFixtureConfig)
    expect(requests.filter(r => r.url.includes('/x509/'))).toHaveLength(1)
    clock.now += 1000
    await verify(token, firebaseFixtureConfig)
    expect(requests.filter(r => r.url.includes('/x509/'))).toHaveLength(2)
    expect(requests.filter(r => r.url.includes('accounts:lookup'))).toHaveLength(3)
  })
  it.each([new Response('bad', { status: 503 }), new Response('redirect', { status: 302 }), new Response('x'.repeat(131073)), new Response('{broken')])('鍵取得異常を拒否する', async response => {
    const verify = createFirebaseTokenVerifierForTesting({ fetch: async () => response, now: () => firebaseFixtureNow * 1000 })
    await expect(verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)).rejects.toThrow()
  })
  it('通信タイムアウトを拒否する', async () => {
    const token = await createFirebaseTokenFixture()
    vi.useFakeTimers()
    try {
      const verify = createFirebaseTokenVerifierForTesting({ fetch: async () => new Promise(() => {}), now: () => firebaseFixtureNow * 1000 })
      const result = expect(verify(token, firebaseFixtureConfig)).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(5001)
      await result
    } finally { vi.useRealTimers() }
  })
  it('unknown kidは短時間に再取得せず、30秒後に一度だけ更新する', async () => {
    const { verify, requests, clock } = setup()
    await verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)
    const unknown = await createFirebaseTokenFixture({ header: { kid: 'unknown' } })
    await expect(verify(unknown, firebaseFixtureConfig)).rejects.toThrow()
    expect(requests.filter(r => r.url.includes('/x509/'))).toHaveLength(1)
    clock.now += 30000
    await expect(verify(unknown, firebaseFixtureConfig)).rejects.toThrow()
    expect(requests.filter(r => r.url.includes('/x509/'))).toHaveLength(2)
    await expect(verify(unknown, firebaseFixtureConfig)).rejects.toThrow()
    expect(requests.filter(r => r.url.includes('/x509/'))).toHaveLength(2)
  })
  it.each(['no-store, max-age=3600', 'no-cache, max-age=3600', '', 'max-age=bad'])('キャッシュできない応答を保持しない: %s', async cacheControl => {
    const { verify, requests } = setup({ cacheControl })
    const token = await createFirebaseTokenFixture()
    await verify(token, firebaseFixtureConfig)
    await verify(token, firebaseFixtureConfig)
    expect(requests.filter(r => r.url.includes('/x509/'))).toHaveLength(2)
  })
  it.each([{}, [], { key: 'invalid certificate' }])('不正な鍵一覧を拒否する', async certificates => {
    await expect(setup({ certificates }).verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)).rejects.toThrow()
  })
  it('鍵の期限切れ後の取得失敗で古い鍵を使わない', async () => {
    const fixture = createFirebaseFixtureFetch({ cacheControl: 'max-age=1' })
    let now = firebaseFixtureNow * 1000
    const fetcher: typeof fetch = async (url, init) => {
      if (now > firebaseFixtureNow * 1000) throw new Error('通信障害')
      return fixture.fetch(url, init)
    }
    const verify = createFirebaseTokenVerifierForTesting({ fetch: fetcher, now: () => now })
    const token = await createFirebaseTokenFixture()
    await verify(token, firebaseFixtureConfig)
    now += 1000
    await expect(verify(token, firebaseFixtureConfig)).rejects.toThrow()
  })
  it.each([503, 302])('lookup HTTPエラーを拒否する: %d', async status => {
    const fixture = createFirebaseFixtureFetch()
    const verify = createFirebaseTokenVerifierForTesting({ now: () => firebaseFixtureNow * 1000,
      fetch: async (url, init) => String(url).includes('accounts:lookup') ? new Response('error', { status }) : fixture.fetch(url, init) })
    await expect(verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)).rejects.toThrow('Firebase認証を確認できませんでした')
  })
  it('content-lengthで過大応答を拒否する', async () => {
    const verify = createFirebaseTokenVerifierForTesting({ now: () => firebaseFixtureNow * 1000,
      fetch: async () => new Response('{}', { headers: { 'content-length': '131073' } }) })
    await expect(verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)).rejects.toThrow()
  })
  it('応答本文の読み取り停止もタイムアウトする', async () => {
    const token = await createFirebaseTokenFixture()
    vi.useFakeTimers()
    try {
      const verify = createFirebaseTokenVerifierForTesting({ now: () => firebaseFixtureNow * 1000,
        fetch: async () => new Response(new ReadableStream({ start() {} })) })
      const result = expect(verify(token, firebaseFixtureConfig)).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(5001)
      await result
    } finally { vi.useRealTimers() }
  })

  it('通常入口でも同じ実署名検証を行う', async () => {
    const fixture = createFirebaseFixtureFetch()
    vi.stubGlobal('fetch', fixture.fetch)
    const now = vi.spyOn(Date, 'now').mockReturnValue(firebaseFixtureNow * 1000)
    try {
      await expect(verifyFirebaseToken(await createFirebaseTokenFixture(), firebaseFixtureConfig)).resolves.toMatchObject({ uid: 'firebase-uid-123' })
    } finally { now.mockRestore() }
  })

  it.each([false, undefined, 'true'])('メールあり時はemail_verified=trueを必須とする: %j', async email_verified => {
    await expect(setup().verify(await createFirebaseTokenFixture({ claims: { email_verified } }), firebaseFixtureConfig)).rejects.toThrow()
  })

  it('全体期限を過ぎたらlookup通信を開始しない', async () => {
    const fixture = createFirebaseFixtureFetch()
    let now = firebaseFixtureNow * 1000
    const verify = createFirebaseTokenVerifierForTesting({ now: () => now, fetch: async (url, init) => {
      const response = await fixture.fetch(url, init)
      now += 10000
      return response
    } })
    await expect(verify(await createFirebaseTokenFixture(), firebaseFixtureConfig)).rejects.toThrow()
    expect(fixture.requests).toHaveLength(1)
  })

})


describe('Firebase検証の安全な段階診断', () => {
  it.each(['input', 'header', 'keys', 'signature', 'claims', 'account'] as const)('固定stageだけを公開する: %s', async stage => {
    const fixture = createFirebaseFixtureFetch(stage === 'account' ? { lookup: { users: [] } } : {})
    const verify = createFirebaseTokenVerifierForTesting({ now: () => firebaseFixtureNow * 1000,
      fetch: stage === 'keys' ? async () => { throw new Error('機密URLと外部エラー本文') } : fixture.fetch })
    const token = stage === 'input' ? '' : stage === 'header' ? 'not.a.token' : await createFirebaseTokenFixture({
      invalidSignature: stage === 'signature',
      claims: stage === 'claims' ? { firebase: { sign_in_provider: 'password' } } : {},
    })
    const error: unknown = await verify(token, firebaseFixtureConfig).catch(error => error)
    expect(error).toBeInstanceOf(FirebaseVerificationError)
    expect(error).toMatchObject({ stage, message: 'Firebase認証を確認できませんでした' })
    expect(error).not.toHaveProperty('cause')
    expect(Object.keys(error as object)).toEqual(['stage'])
    expect(JSON.stringify(error)).toBe(JSON.stringify({ stage }))
    expect(String(error)).not.toContain('機密URLと外部エラー本文')
  })
})
