import { webcrypto } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createGoogleAuthorizationRequest, verifyGoogleCallback } from '@/lib/auth/google-protocol'

import { createGoogleOidcFixture, googleCallbackUrl, googleFixtureConfig as config } from '../../helpers/google-oidc'

beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto)
  // Node WebCryptoが返すArrayBufferとjsdomのrealmを揃える。
  const buffer = await webcrypto.subtle.digest('SHA-256', new Uint8Array())
  vi.stubGlobal('ArrayBuffer', buffer.constructor)
})
afterAll(() => vi.unstubAllGlobals())

describe('Google認証開始', () => {
  it('毎回新しいstate・nonce・PKCEで固定callbackへの認証URLを生成する', async () => {
    const first = await createGoogleAuthorizationRequest(config)
    const second = await createGoogleAuthorizationRequest(config)
    const url = new URL(first.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email',
      state: first.state,
      nonce: first.nonce,
      code_challenge_method: 'S256',
    })
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(first.codeVerifier))
    expect(url.searchParams.get('code_challenge')).toBe(Buffer.from(digest).toString('base64url'))
    for (const key of ['state', 'nonce', 'codeVerifier'] as const) {
      expect(first[key]).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
      expect(first[key]).not.toBe(second[key])
    }
    expect(url.searchParams.has('access_type')).toBe(false)
    expect(url.href).not.toContain(config.clientSecret)
  })
})

describe('Google OAuth設定', () => {
  it.each([
    { clientId: '' }, { clientSecret: ' ' }, { redirectUri: '' },
    { redirectUri: 'http://app.example.com/api/auth/google/callback' },
    { redirectUri: 'https://user:pass@app.example.com/api/auth/google/callback' },
    { redirectUri: 'https://app.example.com/login' },
    { redirectUri: `${config.redirectUri}?returnTo=/` },
    { redirectUri: `${config.redirectUri}#token` },
    { redirectUri: 'http://localhost.evil.test/api/auth/google/callback' },
  ])('不正設定を認証開始前に拒否する: %j', async (override) => {
    await expect(createGoogleAuthorizationRequest({ ...config, ...override }))
      .rejects.toMatchObject({ code: 'invalid_config' })
  })

  it('ローカルの固定callbackだけHTTPを許可する', async () => {
    const result = await createGoogleAuthorizationRequest({
      ...config, redirectUri: 'http://localhost:3000/api/auth/google/callback',
    })
    expect(new URL(result.authorizationUrl).searchParams.get('redirect_uri'))
      .toBe('http://localhost:3000/api/auth/google/callback')
  })
})


describe('Google callback検証', () => {
  it('codeとPKCEを交換して署名済みIDトークンから利用者だけを返す', async () => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture))
      .resolves.toEqual({ issuer: 'https://accounts.google.com', subject: 'google-subject-123', email: 'person@example.com' })
  })
})

it('トークンendpointが返したJWTでも署名が不正なら拒否する', async () => {
  const attempt = await createGoogleAuthorizationRequest(config)
  const fixture = await createGoogleOidcFixture(attempt, { invalidSignature: true })
  await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture))
    .rejects.toMatchObject({ code: 'invalid_token' })
})

describe('callback入口の拒否', () => {
  it.each([
    ['異なるorigin', 'https://evil.example/api/auth/google/callback?code=fixture-code'],
    ['異なるpath', 'https://app.example.com/login?code=fixture-code'],
    ['資格情報付き', 'https://user:pass@app.example.com/api/auth/google/callback?code=fixture-code'],
    ['fragment付き', `${config.redirectUri}?code=fixture-code#secret`],
    ['URLではない', 'not-a-url'],
  ])('%sへ戻るcallbackを通信前に拒否する', async (_, callback) => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    const separator = callback.includes('?') ? '&' : '?'
    await expect(verifyGoogleCallback(config, `${callback}${separator}state=${attempt.state}&iss=https://accounts.google.com`, attempt, fixture))
      .rejects.toMatchObject({ code: 'invalid_callback' })
    expect(fixture.requests).toHaveLength(0)
  })

  it.each([
    ['state欠落', 'state', null], ['state不一致', 'state', 'other-state'],
    ['code欠落', 'code', null], ['code空値', 'code', ''],
    ['issuer欠落', 'iss', null], ['issuer不一致', 'iss', 'https://evil.example'],
  ])('%sを通信前に拒否する', async (_, key, value) => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    const callback = new URL(googleCallbackUrl(attempt.state))
    if (value === null) callback.searchParams.delete(key)
    else callback.searchParams.set(key, value)
    await expect(verifyGoogleCallback(config, callback.href, attempt, fixture))
      .rejects.toMatchObject({ code: 'invalid_callback' })
    expect(fixture.requests).toHaveLength(0)
  })

  it.each(['state', 'code', 'iss'])('重複%sを通信前に拒否する', async key => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    const callback = new URL(googleCallbackUrl(attempt.state))
    callback.searchParams.append(key, callback.searchParams.get(key)!)
    await expect(verifyGoogleCallback(config, callback.href, attempt, fixture))
      .rejects.toMatchObject({ code: 'invalid_callback' })
    expect(fixture.requests).toHaveLength(0)
  })

  it.each(['state', 'nonce', 'codeVerifier'] as const)('保存試行の%s欠落を通信前に拒否する', async key => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), { ...attempt, [key]: '' }, fixture))
      .rejects.toMatchObject({ code: 'invalid_attempt' })
    expect(fixture.requests).toHaveLength(0)
  })

  it('短すぎるPKCE verifierを通信前に拒否する', async () => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), { ...attempt, codeVerifier: 'short' }, fixture))
      .rejects.toMatchObject({ code: 'invalid_attempt' })
    expect(fixture.requests).toHaveLength(0)
  })

  it('callbackでも設定を検証してSecretを送信しない', async () => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    await expect(verifyGoogleCallback({ ...config, redirectUri: 'https://evil.example/wrong' }, googleCallbackUrl(attempt.state), attempt, fixture))
      .rejects.toMatchObject({ code: 'invalid_config' })
    expect(fixture.requests).toHaveLength(0)
  })

  it('正しいstateのキャンセルを安全な種別で返す', async () => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    const callback = new URL(googleCallbackUrl(attempt.state))
    callback.searchParams.delete('code')
    callback.searchParams.set('error', 'access_denied')
    callback.searchParams.set('error_description', 'sensitive-provider-message')
    await expect(verifyGoogleCallback(config, callback.href, attempt, fixture))
      .rejects.toMatchObject({ code: 'access_denied' })
    expect(fixture.requests).toHaveLength(0)
  })
})

describe('IDトークンの拒否', () => {
  it.each([
    ['別audience', { aud: 'other-client' }],
    ['別issuer', { iss: 'https://evil.example' }],
    ['legacy issuer', { iss: 'accounts.google.com' }],
    ['期限切れ', { exp: 1 }],
    ['期限欠落', { exp: undefined }],
    ['nonce不一致', { nonce: 'other-nonce' }],
    ['nonce欠落', { nonce: undefined }],
    ['単audienceのazp不一致', { azp: 'other-client' }],
    ['複数audienceのazp欠落', { aud: [config.clientId, 'other-client'] }],
    ['複数audienceのazp不一致', { aud: [config.clientId, 'other-client'], azp: 'other-client' }],
    ['subject空値', { sub: '' }],
    ['email欠落', { email: undefined }],
    ['email不正', { email: 'invalid' }],
    ['email未確認', { email_verified: false }],
  ])('%sを安全な種別で拒否する', async (_, claims) => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt, { claims })
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture))
      .rejects.toMatchObject({ code: 'invalid_token' })
  })

  it.each([
    ['IDトークン欠落', { omitIdToken: true }],
    ['RS256以外', { algorithm: 'RS512' }],
  ])('%sを拒否する', async (_, options) => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt, options)
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture))
      .rejects.toMatchObject({ code: 'invalid_token' })
  })

  it('複数audienceでもazpが自クライアントなら検証する', async () => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt, { claims: {
      aud: [config.clientId, 'other-client'], azp: config.clientId,
    } })
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture))
      .resolves.toMatchObject({ subject: 'google-subject-123' })
  })
})

describe('外部通信と機密情報', () => {
  it.each([
    ['通信障害', async () => { throw new Error(`network ${config.clientSecret} fixture-code fixture-access-token`) }],
    ['非JSON', async () => new Response(`<html>${config.clientSecret}</html>`, { headers: { 'content-type': 'text/html' } })],
    ['providerのcode交換拒否', async () => Response.json({ error: 'invalid_grant', error_description: config.clientSecret }, { status: 400 })],
  ])('%sを安全なエラーに変換しSecretやcodeを露出しない', async (_, fetcher) => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const error = await verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, { fetch: fetcher }).catch(error => error)
    expect(error).toBeInstanceOf(Error)
    expect(['provider_error', 'invalid_token']).toContain(error.code)
    const rendered = `${String(error)} ${JSON.stringify(error)} ${error.stack}`
    for (const sensitive of [config.clientSecret, 'fixture-code', 'fixture-access-token']) {
      expect(rendered).not.toContain(sensitive)
    }
    expect(error.cause).toBeUndefined()
  })

  it('署名不正のエラーにJWT本文やclaimsを保持しない', async () => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt, { invalidSignature: true })
    const error = await verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture).catch(error => error)
    expect(error.code).toBe('invalid_token')
    expect(error.cause).toBeUndefined()
    expect(`${error.stack} ${JSON.stringify(error)}`).not.toContain(fixture.idToken)
    expect(JSON.stringify(error)).not.toContain('person@example.com')
  })

  it('変更されたPKCE verifierではcode交換が拒否される', async () => {
    const attempt = await createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), {
      ...attempt, codeVerifier: 'a'.repeat(43),
    }, fixture)).rejects.toMatchObject({ code: 'invalid_token' })
  })
})

it('期限の時刻ちょうどに達したIDトークンを許容猶予なしで拒否する', async () => {
  const attempt = await createGoogleAuthorizationRequest(config)
  const fixture = await createGoogleOidcFixture(attempt, { claims: { exp: Math.floor(Date.now() / 1000) } })
  await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture))
    .rejects.toMatchObject({ code: 'invalid_token' })
})

it('HTTP入口からoptionsを渡さない通常呼び出しも署名を検証する', async () => {
  const attempt = await createGoogleAuthorizationRequest(config)
  const fixture = await createGoogleOidcFixture(attempt)
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fixture.fetch)
  try {
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt))
      .resolves.toEqual({ issuer: 'https://accounts.google.com', subject: 'google-subject-123', email: 'person@example.com' })
  } finally {
    fetchSpy.mockRestore()
  }
})

it('キャンセル以外のproviderエラーも本文を返さない', async () => {
  const attempt = await createGoogleAuthorizationRequest(config)
  const fixture = await createGoogleOidcFixture(attempt)
  const callback = new URL(googleCallbackUrl(attempt.state))
  callback.searchParams.delete('code')
  callback.searchParams.set('error', 'temporarily_unavailable')
  callback.searchParams.set('error_description', config.clientSecret)
  const error = await verifyGoogleCallback(config, callback.href, attempt, fixture).catch(error => error)
  expect(error.code).toBe('provider_error')
  expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(config.clientSecret)
  expect(error.cause).toBeUndefined()
  expect(fixture.requests).toHaveLength(0)
})

describe('外部通信のタイムアウト', () => {
  it.each([
    ['token交換', 'https://oauth2.googleapis.com/token', 'provider_error', 0],
    ['JWKS取得', 'https://www.googleapis.com/oauth2/v3/certs', 'invalid_token', 0],
    ['token交換4秒後のJWKS取得', 'https://www.googleapis.com/oauth2/v3/certs', 'invalid_token', 4_000],
  ])('%sが停止しても10秒でabortし安全なエラーで終了する', async (_, endpoint, code, tokenDelay) => {
    // ASオブジェクト単位のJWKSキャッシュを持ち越さず、実取得経路を通す。
    vi.resetModules()
    const protocol = await import('@/lib/auth/google-protocol')
    const attempt = await protocol.createGoogleAuthorizationRequest(config)
    const fixture = await createGoogleOidcFixture(attempt)
    let requestSignal: AbortSignal | null | undefined
    let rejectRequest: (() => void) | undefined
    let started!: () => void
    const requestStarted = new Promise<void>(resolve => { started = resolve })
    const fetcher: typeof fetch = (url, init) => {
      if (String(url) !== endpoint) {
        if (!tokenDelay) return fixture.fetch(url, init)
        return new Promise<Response>(resolve => {
          setTimeout(() => resolve(fixture.fetch(url, init)), tokenDelay)
        })
      }
      requestSignal = init?.signal
      started()
      return new Promise<Response>((_, reject) => {
        rejectRequest = () => reject(new Error(`timeout ${config.clientSecret} fixture-code`))
        requestSignal?.addEventListener('abort', rejectRequest, { once: true })
      })
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let settled = false
    const verification = protocol.verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, { fetch: fetcher })
      .then(value => { settled = true; return value }, error => { settled = true; return error })
    try {
      if (tokenDelay) await vi.advanceTimersByTimeAsync(tokenDelay)
      await requestStarted
      await vi.advanceTimersByTimeAsync(9_999 - tokenDelay)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(requestSignal?.aborted).toBe(true)
      const error = await verification
      expect(error).toMatchObject({ code })
      expect(error.cause).toBeUndefined()
      expect(`${String(error)} ${JSON.stringify(error)} ${error.stack}`).not.toContain(config.clientSecret)
      expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain('fixture-code')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      rejectRequest?.()
      await verification
      vi.useRealTimers()
    }
  })
})

it('検証が期限前に成功した場合はタイマーを解除する', async () => {
  const attempt = await createGoogleAuthorizationRequest(config)
  const fixture = await createGoogleOidcFixture(attempt)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await expect(verifyGoogleCallback(config, googleCallbackUrl(attempt.state), attempt, fixture))
      .resolves.toMatchObject({ subject: 'google-subject-123' })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
