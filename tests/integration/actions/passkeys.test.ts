import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCookies } from '../../../tests/mocks/next'
vi.mock('server-only', () => ({}))
const householdMocks = vi.hoisted(() => ({ assertExistingLoginHousehold: vi.fn() }))
vi.mock('@/lib/api/households', () => householdMocks)
const context = { householdId: 'A', person: null, authMethod: 'password' }
const household = { householdId: 'A' }
import {
  clearApiMocks,
  mockPasskeysApi,
} from '../../../tests/mocks/api'

const simpleWebAuthnMocks = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('@simplewebauthn/server', () => simpleWebAuthnMocks)
vi.mock('@/lib/webauthn/session', () => sessionMocks)

import {
  deletePasskey,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  listPasskeys,
  verifyAuthentication,
  verifyRegistration,
} from '@/app/actions/passkeys'

const registrationCredential = {
  id: 'credential-new',
  rawId: 'credential-new',
  response: {
    attestationObject: '',
    clientDataJSON: '',
  },
  type: 'public-key' as const,
  clientExtensionResults: {},
}

const authenticationCredential = {
  id: 'credential-1',
  rawId: 'credential-1',
  response: {
    authenticatorData: '',
    clientDataJSON: '',
    signature: '',
    userHandle: undefined,
  },
  type: 'public-key' as const,
  clientExtensionResults: {},
}

describe('passkey actions', () => {
  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
    vi.stubEnv('WEBAUTHN_RP_ID', 'localhost')
    vi.stubEnv('WEBAUTHN_RP_ORIGIN', 'http://localhost:3000')
    vi.stubEnv('WEBAUTHN_RP_NAME', 'ヤマワケ')
    sessionMocks.getSession.mockResolvedValue(context)
    mockCookies.get.mockReturnValue({ value: 'challenge-1' })
    mockPasskeysApi.createChallenge.mockResolvedValue({ id: 'challenge-1' })
    householdMocks.assertExistingLoginHousehold.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('登録オプション生成時に既存パスキーをAPIから取得しチャレンジを保存する', async () => {
    mockPasskeysApi.listPasskeys.mockResolvedValueOnce([
      {
        id: 'credential-1',
        person: 'husband',
        publicKeyBase64: 'AQID',
        counter: 0,
        deviceName: 'iPhone',
        transports: ['internal'],
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    simpleWebAuthnMocks.generateRegistrationOptions.mockResolvedValueOnce({
      challenge: 'registration-challenge',
      rp: { name: '家計計算アプリ' },
    })

    const result = await generateRegistrationOptions('husband')

    expect(result.success).toBe(true)
    expect(mockPasskeysApi.listPasskeys).toHaveBeenCalledWith(context, 'husband')
    expect(mockPasskeysApi.createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'registration', context }),
      expect.objectContaining({
        challenge: 'registration-challenge',
        person: 'husband',
      })
    )
  })

  it('認証検証時にbase64公開鍵を検証へ渡しセッションを作成する', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValueOnce({
      householdId: 'A',
      id: 'credential-1',
      person: 'wife',
      publicKeyBase64: Buffer.from([1, 2, 3]).toString('base64'),
      counter: 1,
      deviceName: 'Mac',
      transports: ['internal'],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'auth-challenge',
      type: 'authentication',
      person: null,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })
    simpleWebAuthnMocks.verifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    })

    const result = await verifyAuthentication({
      id: 'credential-1',
      rawId: 'credential-1',
      response: {
        authenticatorData: '',
        clientDataJSON: '',
        signature: '',
        userHandle: undefined,
      },
      type: 'public-key',
      clientExtensionResults: {},
    })

    expect(result).toEqual({ success: true, data: { person: 'wife' } })
    expect(simpleWebAuthnMocks.verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: expect.objectContaining({
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 1,
        }),
      })
    )
    expect(mockPasskeysApi.updatePasskeyCounter).toHaveBeenCalledWith(household, 'credential-1', 2)
    expect(mockPasskeysApi.consumeChallenge).toHaveBeenCalledWith({ type: 'authentication' }, 'challenge-1', null)
    expect(sessionMocks.createSession).toHaveBeenCalledWith(household, 'wife', 'passkey')
  })

  it('登録検証時にoriginとRP IDを検証へ渡してパスキーを保存する', async () => {
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'registration-challenge',
      type: 'registration',
      person: 'husband',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })
    simpleWebAuthnMocks.verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'credential-new',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
        credentialBackedUp: false,
      },
    })

    const result = await verifyRegistration(
      'husband',
      {
        id: 'credential-new',
        rawId: 'credential-new',
        response: {
          attestationObject: '',
          clientDataJSON: '',
          transports: ['internal'],
        },
        type: 'public-key',
        clientExtensionResults: {},
      },
      'MacBook'
    )

    expect(result).toEqual({
      success: true,
      data: { credentialId: 'credential-new' },
    })
    expect(simpleWebAuthnMocks.verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'registration-challenge',
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost',
      })
    )
    expect(mockPasskeysApi.createPasskey).toHaveBeenCalledWith(context, {
      id: 'credential-new',
      person: 'husband',
      publicKeyBase64: Buffer.from([1, 2, 3]).toString('base64'),
      counter: 0,
      deviceName: 'MacBook',
      transports: ['internal'],
    })
    expect(mockPasskeysApi.consumeChallenge).toHaveBeenCalledWith({ type: 'registration', context }, 'challenge-1', 'husband')
  })

  it('登録チャレンジ期限切れ時は検証せずエラーを返す', async () => {
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'registration-challenge',
      type: 'registration',
      person: 'husband',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })

    const result = await verifyRegistration('husband', {
      id: 'credential-new',
      rawId: 'credential-new',
      response: {
        attestationObject: '',
        clientDataJSON: '',
      },
      type: 'public-key',
      clientExtensionResults: {},
    })

    expect(result).toEqual({
      success: false,
      error: 'チャレンジの有効期限が切れました。もう一度お試しください',
    })
    expect(simpleWebAuthnMocks.verifyRegistrationResponse).not.toHaveBeenCalled()
  })

  it('登録検証でoriginまたはRP IDが不一致ならエラーを返す', async () => {
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'registration-challenge',
      type: 'registration',
      person: 'wife',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })
    simpleWebAuthnMocks.verifyRegistrationResponse.mockRejectedValueOnce(
      new Error('origin mismatch')
    )

    const result = await verifyRegistration('wife', {
      id: 'credential-new',
      rawId: 'credential-new',
      response: {
        attestationObject: '',
        clientDataJSON: '',
      },
      type: 'public-key',
      clientExtensionResults: {},
    })

    expect(result).toEqual({
      success: false,
      error: '登録の検証に失敗しました',
    })
    expect(mockPasskeysApi.createPasskey).not.toHaveBeenCalled()
  })

  it('登録済みパスキー一覧をAPIから取得する', async () => {
    mockPasskeysApi.listPasskeys.mockResolvedValueOnce([
      {
        id: 'credential-1',
        person: 'husband',
        publicKeyBase64: 'AQID',
        counter: 0,
        deviceName: 'iPhone',
        transports: [],
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])

    const result = await listPasskeys()

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: 'credential-1',
          person: 'husband',
          deviceName: 'iPhone',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    })
  })

  it('未認証ではパスキー一覧を取得しない', async () => {
    sessionMocks.getSession.mockResolvedValueOnce(null)

    const result = await listPasskeys()

    expect(result).toEqual({ success: false, error: '認証が必要です' })
    expect(mockPasskeysApi.listPasskeys).not.toHaveBeenCalled()
  })

  it('未認証ではパスキーを削除しない', async () => {
    sessionMocks.getSession.mockResolvedValueOnce(null)

    const result = await deletePasskey('credential-1')

    expect(result).toEqual({ success: false, error: '認証が必要です' })
    expect(mockPasskeysApi.deletePasskey).not.toHaveBeenCalled()
  })

  it('未認証では登録オプションを生成しない', async () => {
    sessionMocks.getSession.mockResolvedValueOnce(null)

    const result = await generateRegistrationOptions('wife')

    expect(result).toEqual({ success: false, error: '認証が必要です' })
    expect(simpleWebAuthnMocks.generateRegistrationOptions).not.toHaveBeenCalled()
  })

  it('登録オプション生成時に既存credentialのtransportを引き継ぎ期限切れを削除する', async () => {
    mockPasskeysApi.listPasskeys.mockResolvedValueOnce([
      {
        id: 'credential-1',
        person: 'wife',
        publicKeyBase64: 'AQID',
        counter: 0,
        deviceName: null,
        transports: ['internal'],
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    simpleWebAuthnMocks.generateRegistrationOptions.mockResolvedValueOnce({
      challenge: 'registration-challenge',
    })

    const result = await generateRegistrationOptions('wife')

    expect(result.success).toBe(true)
    expect(simpleWebAuthnMocks.generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpName: 'ヤマワケ',
        userName: '妻',
        excludeCredentials: [{ id: 'credential-1', transports: ['internal'] }],
      })
    )
    expect(mockPasskeysApi.deleteExpiredChallenges).toHaveBeenCalledWith(expect.any(String))
  })

  it.each([new Error('登録生成エラー'), 'unknown'])(
    '登録オプション生成例外を固定文言のActionResultへ変換する',
    async (error) => {
    mockPasskeysApi.listPasskeys.mockRejectedValueOnce(error)

    await expect(generateRegistrationOptions('husband')).resolves.toEqual({
      success: false,
      error: '登録オプションの生成に失敗しました',
    })
    }
  )

  it('認証オプションを生成してチャレンジを保存する', async () => {
    simpleWebAuthnMocks.generateAuthenticationOptions.mockResolvedValueOnce({
      challenge: 'authentication-challenge',
    })

    const result = await generateAuthenticationOptions()

    expect(result).toEqual({
      success: true,
      data: { challenge: 'authentication-challenge' },
    })
    expect(mockPasskeysApi.createChallenge).toHaveBeenCalledWith(
      { type: 'authentication' },
      expect.objectContaining({
        challenge: 'authentication-challenge',
        person: null,
      })
    )
    expect(mockPasskeysApi.deleteExpiredChallenges).toHaveBeenCalledWith(expect.any(String))
  })

  it.each([new Error('認証生成エラー'), 'unknown'])(
    '認証オプション生成例外を固定文言のActionResultへ変換する',
    async (error) => {
    simpleWebAuthnMocks.generateAuthenticationOptions.mockRejectedValueOnce(error)

    await expect(generateAuthenticationOptions()).resolves.toEqual({
      success: false,
      error: '認証オプションの生成に失敗しました',
    })
    }
  )

  it('未認証では登録検証を行わない', async () => {
    sessionMocks.getSession.mockResolvedValueOnce(null)

    const result = await verifyRegistration('husband', registrationCredential)

    expect(result).toEqual({ success: false, error: '認証が必要です' })
    expect(mockPasskeysApi.consumeChallenge).not.toHaveBeenCalled()
  })

  it('登録チャレンジがなければ再試行を案内する', async () => {
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce(null)

    const result = await verifyRegistration('husband', registrationCredential)

    expect(result).toEqual({
      success: false,
      error: 'チャレンジが見つかりません。もう一度お試しください',
    })
  })

  it.each([
    [{ verified: false }, 'verifiedがfalse'],
    [{ verified: true }, '登録情報がない'],
  ])('登録検証結果が不十分なら保存しない: %s', async (verification) => {
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'registration-challenge',
      type: 'registration',
      person: 'husband',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })
    simpleWebAuthnMocks.verifyRegistrationResponse.mockResolvedValueOnce(verification)

    const result = await verifyRegistration('husband', registrationCredential)

    expect(result).toEqual({ success: false, error: 'パスキーの検証に失敗しました' })
    expect(mockPasskeysApi.createPasskey).not.toHaveBeenCalled()
  })

  it.each([
    [true, 'クラウド同期'],
    [false, 'デバイス'],
  ])('端末名とtransport未指定時は同期状態に応じた既定値を保存する', async (backedUp, deviceName) => {
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'registration-challenge',
      type: 'registration',
      person: 'wife',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })
    simpleWebAuthnMocks.verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: {
          id: `credential-${String(backedUp)}`,
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
        credentialBackedUp: backedUp,
      },
    })

    const result = await verifyRegistration('wife', registrationCredential)

    expect(result.success).toBe(true)
    expect(mockPasskeysApi.createPasskey).toHaveBeenCalledWith(
      context, expect.objectContaining({ deviceName, transports: [] })
    )
  })

  it('登録検証で非Error例外が発生した場合は既定エラーを返す', async () => {
    mockPasskeysApi.consumeChallenge.mockRejectedValueOnce('unknown')

    await expect(verifyRegistration('wife', registrationCredential)).resolves.toEqual({
      success: false,
      error: '登録の検証に失敗しました',
    })
  })

  it('未登録credentialの認証を拒否する', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValueOnce(null)

    const result = await verifyAuthentication(authenticationCredential)

    expect(result).toEqual({ success: false, error: '登録されていないパスキーです' })
  })

  it('認証チャレンジがなければ再試行を案内する', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValueOnce({
      householdId: 'A',
      id: 'credential-1',
      person: 'husband',
      publicKeyBase64: 'AQID',
      counter: 0,
      deviceName: null,
      transports: [],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce(null)

    const result = await verifyAuthentication(authenticationCredential)

    expect(result).toEqual({
      success: false,
      error: 'チャレンジが見つかりません。もう一度お試しください',
    })
  })

  it('期限切れ認証チャレンジを拒否する', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValueOnce({
      householdId: 'A',
      id: 'credential-1',
      person: 'husband',
      publicKeyBase64: 'AQID',
      counter: 0,
      deviceName: null,
      transports: [],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'authentication-challenge',
      type: 'authentication',
      person: null,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })

    const result = await verifyAuthentication(authenticationCredential)

    expect(result).toEqual({
      success: false,
      error: 'チャレンジの有効期限が切れました。もう一度お試しください',
    })
  })

  it('WebAuthn認証が未検証ならセッションを作成しない', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValueOnce({
      householdId: 'A',
      id: 'credential-1',
      person: 'husband',
      publicKeyBase64: 'AQID',
      counter: 0,
      deviceName: null,
      transports: [],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({
      id: 'challenge-1',
      challenge: 'authentication-challenge',
      type: 'authentication',
      person: null,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      createdAt: '2026-01-01T00:00:00Z',
    })
    simpleWebAuthnMocks.verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false })

    const result = await verifyAuthentication(authenticationCredential)

    expect(result).toEqual({ success: false, error: 'パスキーの認証に失敗しました' })
    expect(sessionMocks.createSession).not.toHaveBeenCalled()
  })

  it.each([new Error('認証検証エラー'), 'unknown'])(
    '認証検証例外を固定文言のActionResultへ変換する',
    async (error) => {
    mockPasskeysApi.findAuthenticationCredential.mockRejectedValueOnce(error)

    await expect(verifyAuthentication(authenticationCredential)).resolves.toEqual({
      success: false,
      error: '認証の検証に失敗しました',
    })
    }
  )

  it.each([new Error('一覧エラー'), 'unknown'])(
    '一覧取得例外を固定文言のActionResultへ変換する',
    async (error) => {
    mockPasskeysApi.listPasskeys.mockRejectedValueOnce(error)

    await expect(listPasskeys()).resolves.toEqual({
      success: false,
      error: 'パスキー一覧の取得に失敗しました',
    })
    }
  )

  it('パスキーを削除する', async () => {
    const result = await deletePasskey('credential-1')

    expect(result).toEqual({ success: true })
    expect(mockPasskeysApi.deletePasskey).toHaveBeenCalledWith(context, 'credential-1')
  })

  it.each([new Error('削除エラー'), 'unknown'])(
    '削除例外を固定文言のActionResultへ変換する',
    async (error) => {
    mockPasskeysApi.deletePasskey.mockRejectedValueOnce(error)

    await expect(deletePasskey('credential-1')).resolves.toEqual({
      success: false,
      error: 'パスキーの削除に失敗しました',
    })
    }
  )
  it('登録のuserIDは世帯とpersonを含み、cookieはhttpOnlyで試行IDを持つ', async () => {
    mockPasskeysApi.listPasskeys.mockResolvedValue([])
    simpleWebAuthnMocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'test' })
    await generateRegistrationOptions('wife')
    expect(simpleWebAuthnMocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({ userID: new TextEncoder().encode('A:wife') }))
    expect(mockCookies.set).toHaveBeenCalledWith('webauthn_registration', 'challenge-1', expect.objectContaining({ httpOnly: true, sameSite: 'lax', maxAge: 300, path: '/' }))
  })

  it('認証前cookieがなければ別ブラウザのchallengeを検索しない', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValue({ id: 'credential-1', householdId: 'A' })
    mockCookies.get.mockReturnValue(undefined)
    expect((await verifyAuthentication(authenticationCredential)).success).toBe(false)
    expect(mockPasskeysApi.consumeChallenge).not.toHaveBeenCalled()
    expect(simpleWebAuthnMocks.verifyAuthenticationResponse).not.toHaveBeenCalled()
    expect(sessionMocks.createSession).not.toHaveBeenCalled()
  })

  it('同じ試行の並行検証は一回の署名検証とsession発行に限定される', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValue({ id: 'credential-1', householdId: 'A', person: 'wife', publicKeyBase64: 'AQID', counter: 0, transports: [] })
    mockPasskeysApi.consumeChallenge.mockResolvedValueOnce({ challenge: 'one', expiresAt: new Date(Date.now() + 300000).toISOString() }).mockResolvedValue(null)
    simpleWebAuthnMocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } })
    const results = await Promise.all([verifyAuthentication(authenticationCredential), verifyAuthentication(authenticationCredential)])
    expect(results.filter(({ success }) => success)).toHaveLength(1)
    expect(simpleWebAuthnMocks.verifyAuthenticationResponse).toHaveBeenCalledTimes(1)
    expect(sessionMocks.createSession).toHaveBeenCalledTimes(1)
    expect(mockCookies.delete).toHaveBeenCalledWith('webauthn_authentication')
  })

  it('Bのcredentialは署名成功後も新規sessionを発行しない', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValue({ id: 'credential-1', householdId: 'B', person: 'wife', publicKeyBase64: 'AQID', counter: 0, transports: [] })
    mockPasskeysApi.consumeChallenge.mockResolvedValue({ challenge: 'one', expiresAt: new Date(Date.now() + 300000).toISOString() })
    simpleWebAuthnMocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } })
    householdMocks.assertExistingLoginHousehold.mockRejectedValueOnce(new Error('この世帯ではログインできません'))
    expect((await verifyAuthentication(authenticationCredential)).success).toBe(false)
    expect(householdMocks.assertExistingLoginHousehold).toHaveBeenCalledWith({ householdId: 'B' })
    expect(sessionMocks.createSession).not.toHaveBeenCalled()
    expect(mockPasskeysApi.updatePasskeyCounter).not.toHaveBeenCalled()
  })

  it('同期パスキーの署名検証済み0→0でもsessionを発行できる', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValue({ id: 'credential-1', householdId: 'A', person: 'wife', publicKeyBase64: 'AQID', counter: 0, transports: [] })
    mockPasskeysApi.consumeChallenge.mockResolvedValue({ challenge: 'one', expiresAt: new Date(Date.now() + 300000).toISOString() })
    simpleWebAuthnMocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 0 } })
    expect((await verifyAuthentication(authenticationCredential)).success).toBe(true)
    expect(mockPasskeysApi.updatePasskeyCounter).toHaveBeenCalledWith(household, 'credential-1', 0)
    expect(sessionMocks.createSession).toHaveBeenCalledWith(household, 'wife', 'passkey')
  })

  it('署名検証中にcounterが進んだ競合試行はsessionを発行しない', async () => {
    mockPasskeysApi.findAuthenticationCredential.mockResolvedValue({ id: 'credential-1', householdId: 'A', person: 'wife', publicKeyBase64: 'AQID', counter: 1, transports: [] })
    mockPasskeysApi.consumeChallenge.mockResolvedValue({ challenge: 'one', expiresAt: new Date(Date.now() + 300000).toISOString() })
    simpleWebAuthnMocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 2 } })
    mockPasskeysApi.updatePasskeyCounter.mockRejectedValueOnce(new Error('パスキーの状態が変わりました'))
    expect((await verifyAuthentication(authenticationCredential)).success).toBe(false)
    expect(sessionMocks.createSession).not.toHaveBeenCalled()
  })

})
