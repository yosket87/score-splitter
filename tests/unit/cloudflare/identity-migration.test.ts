import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createIdentitySqlite, identityMigration, identitySnapshot } from '../../helpers/identity-sqlite'

describe('Google主体の互換migration', () => {
  it('旧データ・索引・triggerを全て保持し、Googleの5表を空で追加する', () => {
    const { sqlite, apply } = createIdentitySqlite({ migrate: false })
    try {
      const before = identitySnapshot(sqlite)
      apply()
      const after = identitySnapshot(sqlite)
      for (const table of before.rows) {
        const columns = Object.keys(table.rows[0] ?? {})
        const actual = after.rows.find(row => row.table === table.table)?.rows
        expect(actual?.map(row => Object.fromEntries(columns.map(column => [column, row[column]])))).toEqual(table.rows)
      }
      for (const object of before.schema.filter(row => ['index', 'trigger'].includes(String(row.type)))) {
        expect(after.schema).toContainEqual(object)
      }
      for (const name of ['users', 'google_identities', 'household_memberships', 'oauth_login_attempts', 'google_migration_requests']) {
        expect(sqlite.prepare(`SELECT COUNT(*) n FROM ${name}`).get()?.n).toBe(0)
      }
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.prepare('SELECT legacy_auth_disabled_at FROM households').get()?.legacy_auth_disabled_at).toBeNull()
    } finally { sqlite.close() }
  })
  it.each([
    'CREATE TABLE unknown_child(id TEXT, session_token TEXT REFERENCES sessions(token) ON DELETE CASCADE)',
    'ALTER TABLE sessions ADD COLUMN untracked TEXT',
    'CREATE INDEX unknown_index ON sessions(person)',
    'CREATE VIEW unknown_view AS SELECT * FROM payment_records',
    'DROP TRIGGER payment_operations_immutable_update; CREATE TRIGGER payment_operations_immutable_update BEFORE UPDATE ON payment_operations BEGIN SELECT 1; END;',
    'ALTER TABLE login_attempts ADD COLUMN session_token TEXT REFERENCES sessions(token)',
  ])('未知schema・同名改変を保存値変更前に拒否する: %s', change => {
    const { sqlite, apply } = createIdentitySqlite({ migrate: false })
    try {
      sqlite.exec(change)
      const before = identitySnapshot(sqlite)
      expect(() => apply()).toThrow(/CHECK/)
      expect(identitySnapshot(sqlite)).toEqual(before)
    } finally { sqlite.close() }
  })
  it.each([
    'INSERT INTO payment_operations_new (',
    'DROP TABLE payment_operations;',
    'ALTER TABLE payment_records_new RENAME TO payment_records;',
    '-- 旧索引・triggerを同じ定義で復元する。',
  ])('途中故障でDDL/全行が戻り再適用できる: %s', point => {
    const { sqlite, apply } = createIdentitySqlite({ migrate: false })
    try {
      const original = readFileSync('cloudflare/worker/migrations/' + identityMigration, 'utf8')
      expect(original).toContain(point)
      const before = identitySnapshot(sqlite)
      expect(() => apply(original.replace(point, 'INSERT INTO _identity_migration_assert VALUES(0);\n' + point))).toThrow(/CHECK/)
      expect(identitySnapshot(sqlite)).toEqual(before)
      apply()
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally { sqlite.close() }
  })
})
