import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const directory = 'cloudflare/worker/migrations/'
const scope = readFileSync(directory + '0011_scope_household_data.sql','utf8')
const a = '3975b870-bbfa-49fd-ae3d-d273c9f6e107'
function setup(withFixture = false) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  for (const file of readdirSync(directory).filter(file => file.endsWith('.sql') && file < '0009').sort()) db.exec(readFileSync(directory + file, 'utf8'))
  if (withFixture) db.exec(readFileSync('tests/fixtures/household-migration.sql','utf8'))
  for (const name of ['0009_add_households.sql','0010_backfill_households.sql']) db.exec(readFileSync(directory + name,'utf8'))
  return db
}
function apply(db: ReturnType<typeof setup>) {
  db.exec('BEGIN')
  try { db.exec(scope); db.exec('COMMIT') } catch(error) { db.exec('ROLLBACK'); throw error }
}
describe('0011の開始guardと所属制約', () => {
  it.each([
    'DELETE FROM ai_execution_guard; DELETE FROM ai_diagnosis_source_revision; DELETE FROM households',
    "UPDATE households SET legacy_auth_key='unknown'",
    "INSERT INTO households(id,created_at) VALUES('B','now')",
    'DELETE FROM ai_execution_guard',
    'DELETE FROM ai_diagnosis_source_revision',
    "UPDATE ai_execution_guard SET run_token='active'",
    "INSERT INTO ai_diagnoses(household_id,id,month,run_token,created_at,updated_at) VALUES('" + a + "','active','202609','active','now','now')",
    "INSERT INTO webauthn_challenges(id,type,challenge,expires_at,created_at,household_id) VALUES('bad','authentication','challenge','later','now','" + a + "')",
    "CREATE TRIGGER unknown_guard AFTER INSERT ON incomes BEGIN SELECT 1; END;",
  ])('不正な開始状態を補修せずrollback: %s', change => {
    const db = setup()
    try {
      db.exec(change)
      const schema = db.prepare('SELECT sql FROM sqlite_schema ORDER BY name').all()
      expect(() => apply(db)).toThrow()
      expect(db.prepare('SELECT sql FROM sqlite_schema ORDER BY name').all()).toEqual(schema)
    } finally { db.close() }
  })
  it('停止後の旧NULL追記を補完し、全15表の値を変えず、複合FKとimmutableを維持する', () => {
    const db = setup(true)
    try {
      db.exec("UPDATE ai_diagnoses SET run_token=NULL WHERE id='diagnosis'")
      db.exec("INSERT INTO incomes(id,month,label,amount,person,created_at,updated_at) VALUES('late','202610','旧NULL  --  保持',1,'wife','old','old')")
      const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name<>'households'").all().map(row=>String(row.name))
      const before = tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
      apply(db)
      const strip = (rows: typeof before[number]) => rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='household_id')))
      tables.forEach((table,index)=>expect(strip(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).toEqual(strip(before[index])))
      expect(db.prepare("SELECT household_id FROM incomes WHERE id='late'").get()?.household_id).toBe(a)
      for (const table of ['ai_diagnoses','ai_execution_guard','ai_diagnosis_source_revision','month_payment_revisions','payment_operations','payment_records','payment_voids']) {
        expect(db.prepare(`PRAGMA table_info(${table})`).all().find(row=>row.name==='household_id')?.notnull).toBe(1)
        expect(db.prepare(`PRAGMA foreign_key_list(${table})`).all()).toContainEqual(expect.objectContaining({ table: 'households', from: 'household_id' }))
      }
      expect(db.prepare('PRAGMA foreign_key_list(payment_voids)').all()).toContainEqual(expect.objectContaining({table:'payment_records',from:'household_id'}))
      expect(db.prepare('PRAGMA foreign_key_list(payment_voids)').all()).toContainEqual(expect.objectContaining({table:'payment_operations',from:'operation_id'}))
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      for (const table of ['payment_operations','payment_records','payment_voids']) {
        expect(()=>db.exec(`UPDATE ${table} SET created_at='changed'`)).toThrow('PAYMENT_IMMUTABLE')
        expect(()=>db.exec(`DELETE FROM ${table}`)).toThrow('PAYMENT_IMMUTABLE')
      }
      db.exec("INSERT INTO households(id,created_at) VALUES('B','now')")
      for(const table of ['incomes','expenses','carryovers','sessions','passkey_credentials','ai_diagnoses','ai_execution_guard','ai_diagnosis_source_revision','month_payment_revisions']) {
        expect(()=>db.exec(`UPDATE ${table} SET household_id='B'`)).toThrow('HOUSEHOLD_IMMUTABLE')
        expect(()=>db.exec(`UPDATE ${table} SET household_id=NULL`)).toThrow()
      }
      expect(()=>db.exec("UPDATE webauthn_challenges SET type='authentication' WHERE id='register'")).toThrow('HOUSEHOLD_IMMUTABLE')
    } finally { db.close() }
  })
  it('同操作IDの世帯別共存を許し、世帯/異月/kindの不正参照とNULLキーを拒否する', () => {
    const db=setup()
    try {
      apply(db)
      db.exec("INSERT INTO households(id,created_at) VALUES('B','now')")
      const op=(household:string,id:string,month='202609',kind='record')=>db.prepare('INSERT INTO payment_operations(household_id,id,month,kind,expected_revision,input_json,result_json,actor_auth_method,created_at) VALUES(?,?,?,?,0,?,? ,?,?)').run(household,id,month,kind,'{}','{}','password','now')
      const record=(household:string,id:string,operation:string,month='202609')=>db.prepare("INSERT INTO payment_records(household_id,id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version) VALUES(?,?,?,?,1,'2026-09-05','now','{}','v1','v1')").run(household,id,operation,month)
      op(a,'same'); op('B','same'); op('B','foreign')
      record(a,'ra','same'); record('B','rb','same')
      expect(()=>record(a,'foreign-reference','foreign')).toThrow('PAYMENT_OPERATION_INVALID')
      op(a,'wrong-month','202608')
      expect(()=>record(a,'wrong-month','wrong-month')).toThrow('PAYMENT_OPERATION_INVALID')
      op(a,'void-kind','202609','void')
      expect(()=>record(a,'wrong-kind','void-kind')).toThrow('PAYMENT_OPERATION_INVALID')
      op(a,'void-a','202609','void')
      const cancel=(payment:string)=>db.prepare("INSERT INTO payment_voids(household_id,id,operation_id,payment_id,reason,created_at) VALUES(?,'va','void-a',?,'取消','now')").run(a,payment)
      expect(()=>cancel('rb')).toThrow('PAYMENT_OPERATION_INVALID')
      cancel('ra')
      op(a,'duplicate-void','202609','void')
      expect(()=>db.prepare("INSERT INTO payment_voids(household_id,id,operation_id,payment_id,reason,created_at) VALUES(?,'va2','duplicate-void','ra','再取消','now')").run(a)).toThrow(/UNIQUE/)
      expect(()=>db.prepare('INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(?,NULL,0)').run(a)).toThrow(/NOT NULL/)
      expect(()=>db.prepare("INSERT INTO payment_operations(household_id,id,month,kind,expected_revision,input_json,result_json,actor_auth_method,created_at) VALUES(?,NULL,'202609','record',0,'{}','{}','password','now')").run(a)).toThrow(/NOT NULL/)
      expect(()=>db.exec("INSERT INTO ai_diagnoses(household_id,id,month,created_at,updated_at) VALUES('missing','bad','202609','now','now')")).toThrow(/FOREIGN KEY/)
    } finally {db.close()}
  })

})
