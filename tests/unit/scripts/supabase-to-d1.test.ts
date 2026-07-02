import { describe, expect, it } from 'vitest'
import {
  buildD1ImportSql,
  normalizePublicKeyBase64,
} from '../../../scripts/supabase-to-d1.mjs'

describe('supabase-to-d1', () => {
  it('Supabase JSON exportをD1 import SQLへ変換する', () => {
    const sql = buildD1ImportSql({
      incomes: [
        {
          id: 'income-1',
          month: '202601',
          label: '給料',
          amount: 300000,
          person: 'husband',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
      expenses: [],
      carryovers: [],
      passkey_credentials: [
        {
          id: 'credential-1',
          person: 'wife',
          public_key: '\\x010203',
          counter: 2,
          device_name: 'iPhone',
          transports: ['internal'],
          created_at: '2026-01-03T00:00:00Z',
        },
      ],
      sessions: [{ token: 'skip' }],
      webauthn_challenges: [{ id: 'skip' }],
      app_settings: [{ key: 'skip' }],
    })

    expect(sql).toContain('BEGIN TRANSACTION;')
    expect(sql).toContain(
      "INSERT INTO incomes (id, month, label, amount, person, created_at, updated_at) VALUES ('income-1', '202601', '給料', 300000, 'husband', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');"
    )
    expect(sql).toContain(
      "INSERT INTO passkey_credentials (id, person, public_key_base64, counter, device_name, transports, created_at) VALUES ('credential-1', 'wife', 'AQID', 2, 'iPhone', '[\"internal\"]', '2026-01-03T00:00:00Z');"
    )
    expect(sql).not.toContain('sessions')
    expect(sql).not.toContain('webauthn_challenges')
    expect(sql).not.toContain('app_settings')
  })

  it('Postgres BYTEA hex文字列をBase64へ変換する', () => {
    expect(normalizePublicKeyBase64('\\x010203')).toBe('AQID')
  })
})
