import { createRequire } from 'node:module'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const directory = 'cloudflare/worker/migrations/'
const filename = directory + '0012_enforce_household_constraints.sql'
const tables = ['incomes', 'expenses', 'carryovers', 'sessions', 'passkey_credentials', 'webauthn_challenges']
function setup() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && name < '0009').sort()) db.exec(readFileSync(directory + name, 'utf8'))
  db.exec(readFileSync('tests/fixtures/household-migration.sql', 'utf8'))
  db.exec("UPDATE ai_diagnoses SET run_token=NULL WHERE id='diagnosis'")
  for (const name of readdirSync(directory).filter(name => name >= '0009' && name < '0012').sort()) db.exec(readFileSync(directory + name, 'utf8'))
  return db
}
function apply(db: ReturnType<typeof setup>, sql = existsSync(filename) ? readFileSync(filename, 'utf8') : '') {
  db.exec('BEGIN')
  try { db.exec(sql); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
}
function snapshot(db: ReturnType<typeof setup>) {
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all()
  return { schema, rows: schema.filter(row => row.type === 'table').map(row => [row.name, db.prepare(`SELECT * FROM ${row.name} ORDER BY rowid`).all()]) }
}
describe('0012の最終所属制約', () => {
  it('全表・全列とrevision/quota/JSONを保持し、残る6表の制約を完成する', () => {
    const db = setup()
    try {
      const before = snapshot(db)
      apply(db)
      expect(snapshot(db).rows).toEqual(before.rows)
      for (const table of tables) {
        const column = db.prepare(`PRAGMA table_info(${table})`).all().find(row => row.name === 'household_id')
        expect(column?.notnull).toBe(table === 'webauthn_challenges' ? 0 : 1)
        expect(db.prepare(`PRAGMA foreign_key_list(${table})`).all()).toContainEqual(expect.objectContaining({ table: 'households', from: 'household_id' }))
      }
      expect(String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='webauthn_challenges'").get()?.sql)).toContain("type='registration' AND household_id IS NOT NULL")
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(snapshot(db).schema.filter(row => row.type === 'trigger')).toEqual(before.schema.filter(row => row.type === 'trigger'))
      db.exec("INSERT INTO households(id,created_at) VALUES('B','now')")
      for (const table of tables.filter(table => table !== 'webauthn_challenges')) {
        expect(() => db.exec(`UPDATE ${table} SET household_id='B'`)).toThrow('HOUSEHOLD_IMMUTABLE')
        expect(() => db.exec(`UPDATE ${table} SET household_id=NULL`)).toThrow()
      }
      expect(() => db.exec("UPDATE webauthn_challenges SET type='authentication' WHERE id='register'")).toThrow()
      expect(() => db.exec("UPDATE webauthn_challenges SET household_id='B' WHERE id='authenticate'")).toThrow()
      for (const table of ['payment_operations', 'payment_records', 'payment_voids']) {
        expect(() => db.exec(`UPDATE ${table} SET created_at='changed'`)).toThrow('PAYMENT_IMMUTABLE')
        expect(() => db.exec(`DELETE FROM ${table}`)).toThrow('PAYMENT_IMMUTABLE')
      }
    } finally { db.close() }
  })
  it.each([
    "UPDATE households SET legacy_auth_key='unknown'",
    "INSERT INTO households(id,created_at) VALUES('B','now')",
    'DROP TRIGGER incomes_household_update; UPDATE incomes SET household_id=NULL',
    "CREATE TRIGGER unknown_guard AFTER INSERT ON incomes BEGIN SELECT 1; END;",
    'CREATE TABLE unknown_child(id TEXT, income_id TEXT REFERENCES incomes(id))',
    'ALTER TABLE login_attempts ADD COLUMN income_id TEXT REFERENCES incomes(id)',
    'ALTER TABLE incomes ADD COLUMN untracked TEXT',
  ])('想定外の開始状態を補修しない: %s', change => {
    const db = setup()
    try { db.exec(change); const before = snapshot(db); expect(() => apply(db)).toThrow(); expect(snapshot(db)).toEqual(before) } finally { db.close() }
  })
  it('旧明細DROP後の故障で全schemaと保持値が戻り、再試行できる', () => {
    const db = setup()
    try {
      const sql = existsSync(filename) ? readFileSync(filename, 'utf8') : ''
      const before = snapshot(db)
      expect(() => apply(db, sql.replace('DROP TABLE expenses;', 'INSERT INTO _household_migration_assert VALUES(0); DROP TABLE expenses;'))).toThrow()
      expect(snapshot(db)).toEqual(before)
      apply(db)
      expect(snapshot(db).rows).toEqual(before.rows)
    } finally { db.close() }
  })
})
