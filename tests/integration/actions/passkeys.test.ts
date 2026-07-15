import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
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
  isAuthenticated: vi.fn(),
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
    userHandle: null,
  },
  type: 'public-key' as const,
  clientExtensionResults: {},
}

describe('passkey actions', () => {
  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
    process.env.WEBAUTHN_RP_ID = 'localhost'
    process.env.WEBAUTHN_RP_ORIGIN = 'http://localhost:3000'
    process.env.WEBAUTHN_RP_NAME = 'ヤマワケ'
    sessionMocks.isAuthenticated.mockResolvedValue(true)
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
    expect(mockPasskeysApi.listPasskeys).toHaveBeenCalledWith('husband')
    expect(mockPasskeysApi.createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: 'registration-challenge',
        type: 'registration',
        person: 'husband',
      })
    )
  })

  it('認証検証時にbase64公開鍵を検証へ渡しセッションを作成する', async () => {
    mockPasskeysApi.getPasskey.mockResolvedValueOnce({
      id: 'credential-1',
      person: 'wife',
      publicKeyBase64: Buffer.from([1, 2, 3]).toString('base64'),
      counter: 1,
      deviceName: 'Mac',
      transports: ['internal'],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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
        userHandle: null,
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
    expect(mockPasskeysApi.updatePasskeyCounter).toHaveBeenCalledWith('credential-1', 2)
    expect(mockPasskeysApi.deleteChallenges).toHaveBeenCalledWith({
      type: 'authentication',
      person: null,
    })
    expect(sessionMocks.createSession).toHaveBeenCalledWith('wife', 'passkey')
  })

  it('登録検証時にoriginとRP IDを検証へ渡してパスキーを保存する', async () => {
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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
    expect(mockPasskeysApi.createPasskey).toHaveBeenCalledWith({
      id: 'credential-new',
      person: 'husband',
      publicKeyBase64: Buffer.from([1, 2, 3]).toString('base64'),
      counter: 0,
      deviceName: 'MacBook',
      transports: ['internal'],
    })
    expect(mockPasskeysApi.deleteChallenges).toHaveBeenCalledWith({
      type: 'registration',
      person: 'husband',
    })
  })

  it('登録チャレンジ期限切れ時は検証せずエラーを返す', async () => {
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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
      error: 'origin mismatch',
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
    sessionMocks.isAuthenticated.mockResolvedValueOnce(false)

    const result = await listPasskeys()

    expect(result).toEqual({ success: false, error: '認証が必要です' })
    expect(mockPasskeysApi.listPasskeys).not.toHaveBeenCalled()
  })

  it('未認証ではパスキーを削除しない', async () => {
    sessionMocks.isAuthenticated.mockResolvedValueOnce(false)

    const result = await deletePasskey('credential-1')

    expect(result).toEqual({ success: false, error: '認証が必要です' })
    expect(mockPasskeysApi.deletePasskey).not.toHaveBeenCalled()
  })

  it('未認証では登録オプションを生成しない', async () => {
    sessionMocks.isAuthenticated.mockResolvedValueOnce(false)

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

  it.each([
    [new Error('登録生成エラー'), '登録生成エラー'],
    ['unknown', '登録オプションの生成に失敗しました'],
  ])('登録オプション生成例外をActionResultへ変換する', async (error, message) => {
    mockPasskeysApi.listPasskeys.mockRejectedValueOnce(error)

    await expect(generateRegistrationOptions('husband')).resolves.toEqual({
      success: false,
      error: message,
    })
  })

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
      expect.objectContaining({
        challenge: 'authentication-challenge',
        type: 'authentication',
        person: null,
      })
    )
    expect(mockPasskeysApi.deleteExpiredChallenges).toHaveBeenCalledWith(expect.any(String))
  })

  it.each([
    [new Error('認証生成エラー'), '認証生成エラー'],
    ['unknown', '認証オプションの生成に失敗しました'],
  ])('認証オプション生成例外をActionResultへ変換する', async (error, message) => {
    simpleWebAuthnMocks.generateAuthenticationOptions.mockRejectedValueOnce(error)

    await expect(generateAuthenticationOptions()).resolves.toEqual({
      success: false,
      error: message,
    })
  })

  it('未認証では登録検証を行わない', async () => {
    sessionMocks.isAuthenticated.mockResolvedValueOnce(false)

    const result = await verifyRegistration('husband', registrationCredential)

    expect(result).toEqual({ success: false, error: '認証が必要です' })
    expect(mockPasskeysApi.getLatestChallenge).not.toHaveBeenCalled()
  })

  it('登録チャレンジがなければ再試行を案内する', async () => {
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce(null)

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
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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
      expect.objectContaining({ deviceName, transports: [] })
    )
  })

  it('登録検証で非Error例外が発生した場合は既定エラーを返す', async () => {
    mockPasskeysApi.getLatestChallenge.mockRejectedValueOnce('unknown')

    await expect(verifyRegistration('wife', registrationCredential)).resolves.toEqual({
      success: false,
      error: '登録の検証に失敗しました',
    })
  })

  it('未登録credentialの認証を拒否する', async () => {
    mockPasskeysApi.getPasskey.mockResolvedValueOnce(null)

    const result = await verifyAuthentication(authenticationCredential)

    expect(result).toEqual({ success: false, error: '登録されていないパスキーです' })
  })

  it('認証チャレンジがなければ再試行を案内する', async () => {
    mockPasskeysApi.getPasskey.mockResolvedValueOnce({
      id: 'credential-1',
      person: 'husband',
      publicKeyBase64: 'AQID',
      counter: 0,
      deviceName: null,
      transports: [],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce(null)

    const result = await verifyAuthentication(authenticationCredential)

    expect(result).toEqual({
      success: false,
      error: 'チャレンジが見つかりません。もう一度お試しください',
    })
  })

  it('期限切れ認証チャレンジを拒否する', async () => {
    mockPasskeysApi.getPasskey.mockResolvedValueOnce({
      id: 'credential-1',
      person: 'husband',
      publicKeyBase64: 'AQID',
      counter: 0,
      deviceName: null,
      transports: [],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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
    mockPasskeysApi.getPasskey.mockResolvedValueOnce({
      id: 'credential-1',
      person: 'husband',
      publicKeyBase64: 'AQID',
      counter: 0,
      deviceName: null,
      transports: [],
      createdAt: '2026-01-01T00:00:00Z',
    })
    mockPasskeysApi.getLatestChallenge.mockResolvedValueOnce({
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

  it.each([
    [new Error('認証検証エラー'), '認証検証エラー'],
    ['unknown', '認証の検証に失敗しました'],
  ])('認証検証例外をActionResultへ変換する', async (error, message) => {
    mockPasskeysApi.getPasskey.mockRejectedValueOnce(error)

    await expect(verifyAuthentication(authenticationCredential)).resolves.toEqual({
      success: false,
      error: message,
    })
  })

  it.each([
    [new Error('一覧エラー'), '一覧エラー'],
    ['unknown', '不明なエラー'],
  ])('一覧取得例外をActionResultへ変換する', async (error, message) => {
    mockPasskeysApi.listPasskeys.mockRejectedValueOnce(error)

    await expect(listPasskeys()).resolves.toEqual({
      success: false,
      error: `パスキー一覧の取得に失敗しました: ${message}`,
    })
  })

  it('パスキーを削除する', async () => {
    const result = await deletePasskey('credential-1')

    expect(result).toEqual({ success: true })
    expect(mockPasskeysApi.deletePasskey).toHaveBeenCalledWith('credential-1')
  })

  it.each([
    [new Error('削除エラー'), '削除エラー'],
    ['unknown', '不明なエラー'],
  ])('削除例外をActionResultへ変換する', async (error, message) => {
    mockPasskeysApi.deletePasskey.mockRejectedValueOnce(error)

    await expect(deletePasskey('credential-1')).resolves.toEqual({
      success: false,
      error: `パスキーの削除に失敗しました: ${message}`,
    })
  })
})
