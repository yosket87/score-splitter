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
  generateRegistrationOptions,
  listPasskeys,
  verifyAuthentication,
  verifyRegistration,
} from '@/app/actions/passkeys'

describe('passkey actions', () => {
  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
    process.env.WEBAUTHN_RP_ID = 'localhost'
    process.env.WEBAUTHN_RP_ORIGIN = 'http://localhost:3000'
    process.env.WEBAUTHN_RP_NAME = '家計計算アプリ'
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
})
