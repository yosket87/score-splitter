import { createRequire } from 'node:module'
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const directory = 'cloudflare/worker/migrations/'
const migration = (name: string) => readFileSync(directory + name, 'utf8')
const householdId = '3975b870-bbfa-49fd-ae3d-d273c9f6e107'
const setup = (withFixture = true) => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON;')
  for (const name of readdirSync(directory).filter(name => name < '0009').sort()) db.exec(migration(name))
  if (withFixture) db.exec(readFileSync('tests/fixtures/household-migration.sql', 'utf8'))
  return db
}
const snapshot = (db: SqliteDatabase) => Object.fromEntries(
  db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({ name }) => [String(name), db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()])
)
const apply = (db: SqliteDatabase) => {
  db.exec('BEGIN;')
  try { db.exec(migration('0010_backfill_households.sql')); db.exec('COMMIT;') }
  catch (error) { db.exec('ROLLBACK;'); throw error }
}

describe('世帯互換migration 0009/0010', () => {
  it('15表の全保持列・revision・quota・triggerを保存し13表だけ所属を補完する', () => {
    const db = setup()
    try {
      const before = snapshot(db)
      const triggers = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all()
      db.exec(migration('0009_add_households.sql'))
      expect(db.prepare('SELECT * FROM households').all()).toEqual([{ id: householdId, legacy_auth_key: 'legacy', created_at: '2026-09-05T00:00:00.000Z' }])
      for (const table of Object.keys(before).filter(table => !['login_attempts', 'waitlist_entries'].includes(table))) {
        expect(db.prepare(`PRAGMA table_info(${table})`).all().find(column => column.name === 'household_id')).toMatchObject({ type: 'TEXT', notnull: 0, dflt_value: null })
        expect(db.prepare(`PRAGMA foreign_key_list(${table})`).all()).toContainEqual(expect.objectContaining({ table: 'households', from: 'household_id', to: 'id' }))
      }
      expect(() => db.exec("INSERT INTO households(id,legacy_auth_key,created_at) VALUES(NULL,NULL,'now')")).toThrow(/NOT NULL/)
      expect(() => db.exec("INSERT INTO households VALUES('duplicate','legacy','now')")).toThrow(/UNIQUE/)
      apply(db)
      const after = snapshot(db)
      for (const [table, rows] of Object.entries(before)) {
        expect(after[table].map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'household_id')))).toEqual(rows)
        if (!['login_attempts', 'waitlist_entries'].includes(table)) {
          for (const row of after[table]) expect(row.household_id).toBe(row.type === 'authentication' ? null : householdId)
        }
      }
      expect(db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all()).toEqual(triggers)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      for (const table of ['payment_operations', 'payment_records', 'payment_voids']) {
        expect(() => db.exec(`UPDATE ${table} SET created_at='changed'`)).toThrow('PAYMENT_IMMUTABLE')
        expect(() => db.exec(`DELETE FROM ${table}`)).toThrow('PAYMENT_IMMUTABLE')
      }
    } finally { db.close() }
  })
  it.each([9,10])('%s適用後も15表の旧列指定SQLを実行できる', stage => {
    const db = setup(false)
    try {
      db.exec(migration('0009_add_households.sql'))
      if (stage === 10) apply(db)
      db.exec(readFileSync('tests/fixtures/household-migration.sql', 'utf8'))
      const rows = snapshot(db)
      for (const table of ['incomes', 'expenses', 'carryovers', 'sessions', 'passkey_credentials', 'webauthn_challenges', 'ai_diagnoses', 'month_payment_revisions', 'payment_operations', 'payment_records', 'payment_voids']) {
        expect(rows[table].length).toBeGreaterThan(0)
        expect(rows[table].every(row => row.household_id === null)).toBe(true)
      }
      expect(rows.ai_execution_guard[0].daily_count).toBe(7)
      expect(rows.ai_diagnosis_source_revision[0].revision).toBe(29)
      expect(() => db.exec("INSERT INTO ai_diagnoses(id,month,created_at,updated_at) VALUES('duplicate','202609','now','now')")).toThrow(/UNIQUE/)
      db.exec("UPDATE ai_diagnoses SET run_token=NULL WHERE id='diagnosis'")
      expect(db.prepare('SELECT run_token FROM ai_execution_guard').get()?.run_token).toBeNull()
    } finally { db.close() }
  })
  it.each([9,10])('%s適用後も旧SQLのNULL書込・更新・キー・triggerが動く', stage => {
    const db = setup()
    try {
      db.exec(migration('0009_add_households.sql'))
      if (stage === 10) apply(db)
      db.exec("INSERT INTO incomes(id,month,label,amount,person,created_at,updated_at) VALUES('new','202610','旧SQL',100,'wife','now','now')")
      expect(db.prepare("SELECT household_id FROM incomes WHERE id='new'").get()?.household_id).toBeNull()
      db.exec("UPDATE incomes SET amount=200 WHERE id='new'")
      expect(db.prepare("SELECT revision FROM month_payment_revisions WHERE month='202610'").get()?.revision).toBe(2)
      expect(() => db.exec("UPDATE incomes SET household_id='unknown' WHERE id='new'")).toThrow(/FOREIGN KEY/)
    } finally { db.close() }
  })
  it.each([
    'DELETE FROM households',
    "UPDATE households SET legacy_auth_key='unknown'",
    "UPDATE households SET id='unknown'",
    "INSERT INTO households VALUES('second',NULL,'now')",
    "PRAGMA foreign_keys=OFF; UPDATE incomes SET household_id='unknown'",
    `UPDATE webauthn_challenges SET household_id='${householdId}' WHERE type='authentication'`,
    "PRAGMA ignore_check_constraints=ON; UPDATE webauthn_challenges SET type='unknown'; PRAGMA ignore_check_constraints=OFF",
    "PRAGMA ignore_check_constraints=ON; UPDATE sessions SET auth_method='unknown'; PRAGMA ignore_check_constraints=OFF",
    "DROP TRIGGER payment_operations_immutable_update; PRAGMA ignore_check_constraints=ON; UPDATE payment_operations SET actor_auth_method='unknown'; PRAGMA ignore_check_constraints=OFF",
  ])('不明な世帯・認証状態を拒否して全変更をrollbackする: %s', corrupt => {
    const db = setup()
    try {
      db.exec(migration('0009_add_households.sql'))
      db.exec(corrupt)
      const before = snapshot(db)
      expect(() => apply(db)).toThrow(/CHECK/)
      expect(snapshot(db)).toEqual(before)
    } finally { db.close() }
  })
})
