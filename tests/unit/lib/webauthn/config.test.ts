import { describe, it, expect, beforeEach } from 'vitest'
import { getWebAuthnConfig } from '@/lib/webauthn/config'

describe('getWebAuthnConfig', () => {
  beforeEach(() => {
    delete process.env.WEBAUTHN_RP_ID
    delete process.env.WEBAUTHN_RP_ORIGIN
    delete process.env.WEBAUTHN_RP_NAME
  })

  it('環境変数から設定を取得する', () => {
    process.env.WEBAUTHN_RP_ID = 'example.com'
    process.env.WEBAUTHN_RP_ORIGIN = 'https://example.com'
    process.env.WEBAUTHN_RP_NAME = 'テストアプリ'

    const config = getWebAuthnConfig()

    expect(config).toEqual({
      rpID: 'example.com',
      rpName: 'テストアプリ',
      origin: 'https://example.com',
    })
  })

  it('RP_NAMEが未設定の場合デフォルト名を使用する', () => {
    process.env.WEBAUTHN_RP_ID = 'localhost'
    process.env.WEBAUTHN_RP_ORIGIN = 'http://localhost:3000'

    const config = getWebAuthnConfig()

    expect(config.rpName).toBe('Score Splitter')
  })

  it('RP_IDが未設定の場合エラーをスローする', () => {
    process.env.WEBAUTHN_RP_ORIGIN = 'http://localhost:3000'

    expect(() => getWebAuthnConfig()).toThrow(
      'WEBAUTHN_RP_ID と WEBAUTHN_RP_ORIGIN の環境変数が必要です'
    )
  })

  it('RP_ORIGINが未設定の場合エラーをスローする', () => {
    process.env.WEBAUTHN_RP_ID = 'localhost'

    expect(() => getWebAuthnConfig()).toThrow(
      'WEBAUTHN_RP_ID と WEBAUTHN_RP_ORIGIN の環境変数が必要です'
    )
  })
})
