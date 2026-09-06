import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// 設定・DB・migrationを毎回隔離し、本番や開発のremote DBへ接続しない。
const temp = mkdtempSync(join(tmpdir(), 'household-migrations-'))
const migrations = join(temp, 'migrations')
const config = join(temp, 'wrangler.json')
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
const source = resolve('cloudflare/worker/migrations')
const householdId = '3975b870-bbfa-49fd-ae3d-d273c9f6e107'
const backfillName = '0010_backfill_households.sql'
const fixture = readFileSync('tests/fixtures/household-migration.sql', 'utf8')
mkdirSync(migrations)
writeFileSync(config, JSON.stringify({
  name: 'household-migration-test', compatibility_date: '2026-09-05',
  d1_databases: [{ binding: 'DB', database_name: 'household-test', database_id: '00000000-0000-0000-0000-000000000001', migrations_dir: migrations }],
}))
const run = args => {
  try { return execFileSync(process.execPath, [wrangler, 'd1', ...args, '--local', '--config', config, '--persist-to', join(temp, 'state')], {
  cwd: temp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(temp, 'logs') },
}) } catch (error) {
    throw new Error(`${error.message}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`, { cause: error })
  }
}
const apply = () => run(['migrations', 'apply', 'household-test'])
const execute = sql => {
  const file = join(temp, 'query.sql')
  writeFileSync(file, sql)
  return JSON.parse(run(['execute', 'household-test', '--file', file, '--json'])).map(result => result.results)
}
const schemaSql = "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name;"
const tables = ['incomes', 'expenses', 'carryovers', 'sessions', 'passkey_credentials', 'webauthn_challenges', 'login_attempts', 'waitlist_entries', 'ai_diagnoses', 'ai_execution_guard', 'ai_diagnosis_source_revision', 'month_payment_revisions', 'payment_operations', 'payment_records', 'payment_voids']
const snapshot = () => execute([schemaSql, ...[...tables, 'households', 'd1_migrations'].map(table => `SELECT * FROM ${table} ORDER BY rowid;`)].join('\n'))
const stage = name => writeFileSync(join(migrations, name), readFileSync(join(source, name), 'utf8'))

try {
  for (const name of readdirSync(source).filter(name => name.endsWith('.sql') && name < '0009').sort()) stage(name)
  apply()
  execute(fixture)
  const original = execute(tables.map(table => `SELECT * FROM ${table} ORDER BY rowid;`).join('\n'))
  stage('0009_add_households.sql')
  apply()
  const before = snapshot()
  const backfill = readFileSync(join(source, backfillName), 'utf8')
  // 台帳UPDATEとtrigger解除の後に失敗させ、DDL・全行・適用台帳の原子性を確認する。
  const failurePoint = '-- 0008の定義を完全復元する。'
  assert.ok(backfill.includes(failurePoint))
  writeFileSync(join(migrations, backfillName), backfill.replace(failurePoint, 'INSERT INTO _household_migration_assert (ok) VALUES (0);\n' + failurePoint))
  assert.throws(apply, /CHECK constraint failed/)
  assert.deepEqual(snapshot(), before)
  // 正規SQLで再試行でき、assert表や失敗したmigration名が残らない。
  stage(backfillName)
  apply()
  const after = snapshot()
  for (let index = 0; index < tables.length; index++) {
    const rows = after[index + 1]
    assert.deepEqual(rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'household_id'))), original[index])
    if (!['login_attempts', 'waitlist_entries'].includes(tables[index])) {
      for (const row of rows) assert.equal(row.household_id, row.type === 'authentication' ? null : householdId)
    }
  }
  assert.deepEqual(after[0], before[0])
  assert.equal(after.at(-1).at(-1).name, backfillName)
  assert.deepEqual(execute('PRAGMA foreign_key_check;'), [[]])
  for (const table of ['payment_operations', 'payment_records', 'payment_voids']) {
    assert.throws(() => execute(`UPDATE ${table} SET created_at='changed';`), /PAYMENT_IMMUTABLE/)
    assert.throws(() => execute(`DELETE FROM ${table};`), /PAYMENT_IMMUTABLE/)
  }
  execute("INSERT INTO incomes(id,month,label,amount,person,created_at,updated_at) VALUES('legacy-new','202610','旧版  --  SQL',100,'wife','now','now');")
  assert.deepEqual(execute("SELECT household_id,label FROM incomes WHERE id='legacy-new';"), [[{ household_id: null, label: '旧版  --  SQL' }]])
  assert.throws(() => execute("UPDATE incomes SET household_id='unknown' WHERE id='legacy-new';"), /FOREIGN KEY constraint failed/)
  // 旧処理が正常終了してから停止後snapshotを採取する。migration自身はtokenを消去しない。
  execute("UPDATE ai_diagnoses SET run_token=NULL WHERE id='diagnosis';")
  const stopped = snapshot()
  const scopedName = '0011_scope_household_data.sql'
  const scoped = readFileSync(join(source, scopedName), 'utf8')
  for (const point of ['DROP TABLE payment_voids;', 'DROP TABLE payment_operations;', 'ALTER TABLE payment_records_new RENAME TO payment_records;', 'CREATE TRIGGER release_ai_execution_guard']) {
    assert.ok(scoped.includes(point))
    writeFileSync(join(migrations, scopedName), scoped.replace(point, 'INSERT INTO _household_migration_assert VALUES(0);\n' + point))
    assert.throws(apply, /CHECK constraint failed/)
    assert.deepEqual(snapshot(), stopped)
  }
  stage(scopedName)
  apply()
  const scopedAfter = snapshot()
  for (let index = 0; index < tables.length; index++) {
    const stripHousehold = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'household_id')))
    assert.deepEqual(stripHousehold(scopedAfter[index + 1]), stripHousehold(stopped[index + 1]))
  }
  assert.equal(scopedAfter.at(-1).at(-1).name, scopedName)
  assert.deepEqual(execute('PRAGMA foreign_key_check;'), [[]])
  assert.deepEqual(execute("SELECT household_id,label FROM incomes WHERE id='legacy-new';"), [[{ household_id: householdId, label: '旧版  --  SQL' }]])
  for (const table of ['payment_operations', 'payment_records', 'payment_voids']) {
    assert.throws(() => execute(`UPDATE ${table} SET created_at='changed';`), /PAYMENT_IMMUTABLE/)
    assert.throws(() => execute(`DELETE FROM ${table};`), /PAYMENT_IMMUTABLE/)
  }
  assert.throws(() => execute("INSERT INTO incomes(id,month,label,amount,person,created_at,updated_at) VALUES('forbidden','202610','NULL',100,'wife','now','now');"), /HOUSEHOLD_REQUIRED/)
  console.log('0011: 最終NULL補完・全保持列/JSON/quota/revision・コピー後/旧DROP後/rename途中/trigger復元前のDDL rollbackと再試行を確認')
  console.log('世帯migration D1検証成功: 15表保持・13表所属・認証challenge無所属・DDL/data/trigger/適用台帳rollback・再適用・旧SQL互換・immutable/FK')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
