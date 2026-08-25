import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getWebAuthnConfig } from '@/lib/webauthn/config'

describe('getWebAuthnConfig', () => {
  beforeEach(() => {
    vi.stubEnv('WEBAUTHN_RP_ID', undefined)
    vi.stubEnv('WEBAUTHN_RP_ORIGIN', undefined)
    vi.stubEnv('WEBAUTHN_RP_NAME', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('環境変数から設定を取得する', () => {
    vi.stubEnv('WEBAUTHN_RP_ID', 'example.com')
    vi.stubEnv('WEBAUTHN_RP_ORIGIN', 'https://example.com')
    vi.stubEnv('WEBAUTHN_RP_NAME', 'テストアプリ')

    const config = getWebAuthnConfig()

    expect(config).toEqual({
      rpID: 'example.com',
      rpName: 'テストアプリ',
      origin: 'https://example.com',
    })
  })

  it('RP_NAMEが未設定の場合デフォルト名を使用する', () => {
    vi.stubEnv('WEBAUTHN_RP_ID', 'localhost')
    vi.stubEnv('WEBAUTHN_RP_ORIGIN', 'http://localhost:3000')

    const config = getWebAuthnConfig()

    expect(config.rpName).toBe('ヤマワケ')
  })

  it('モック環境でもブランド名を使用する', () => {
    const envMock = readFileSync(join(process.cwd(), '.env.mock'), 'utf-8')

    expect(envMock).toContain('WEBAUTHN_RP_NAME=ヤマワケ')
  })

  it('RP_IDが未設定の場合エラーをスローする', () => {
    vi.stubEnv('WEBAUTHN_RP_ORIGIN', 'http://localhost:3000')

    expect(() => getWebAuthnConfig()).toThrow(
      'WEBAUTHN_RP_ID と WEBAUTHN_RP_ORIGIN の環境変数が必要です'
    )
  })

  it('RP_ORIGINが未設定の場合エラーをスローする', () => {
    vi.stubEnv('WEBAUTHN_RP_ID', 'localhost')

    expect(() => getWebAuthnConfig()).toThrow(
      'WEBAUTHN_RP_ID と WEBAUTHN_RP_ORIGIN の環境変数が必要です'
    )
  })
})
