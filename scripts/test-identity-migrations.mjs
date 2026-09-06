import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildCountSql, createExpectedBackupSchema, readBackupSchema } from './backup-schema.mjs'
import { restoreAndInspectBackup } from './backup-sqlite.mjs'
import { assertD1RemoteTriggerSyntax } from './identity-migration-sql.mjs'

// 毎回独立した設定・migration・D1だけを利用する。remote指定や実設定を受け付けない。
const temp = mkdtempSync(join(tmpdir(), 'identity-migrations-'))
const migrations = join(temp, 'migrations')
const config = join(temp, 'wrangler.json')
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js')
const source = resolve('cloudflare/worker/migrations')
const filename = '0013_add_google_identities.sql'
const migration = readFileSync(join(source, filename), 'utf8')
const started = performance.now()
mkdirSync(migrations)
writeFileSync(config, JSON.stringify({
  name: 'identity-migration-test', compatibility_date: '2026-09-06',
  d1_databases: [{ binding: 'DB', database_name: 'identity-test', database_id: '00000000-0000-0000-0000-000000000013', migrations_dir: migrations }],
}))
let state = join(temp, '.wrangler/state')
function run(args) {
  try {
    return execFileSync(process.execPath, [wrangler, 'd1', ...args, '--local', '--config', config,
      ...(args[0] === 'export' ? [] : ['--persist-to', state])], {
      cwd: temp, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(temp, 'logs') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(`${error.message}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`, { cause: error })
  }
}
const stage = name => writeFileSync(join(migrations, name), readFileSync(join(source, name)))
const apply = () => run(['migrations', 'apply', 'identity-test'])
function execute(sql) {
  const file = join(temp, 'query.sql')
  writeFileSync(file, sql)
  return JSON.parse(run(['execute', 'identity-test', '--file', file, '--json'])).map(result => result.results)
}
const quote = name => `"${name.replaceAll('"', '""')}"`
function snapshot() {
  const schema = execute("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_KV','_cf_METADATA') ORDER BY type,name;")[0]
  const tables = schema.filter(row => row.type === 'table').map(row => row.name)
  const rows = execute(tables.map(table => `SELECT * FROM ${quote(table)} ORDER BY rowid;`).join('\n'))
  return { schema, rows: tables.map((table, index) => ({ table, rows: rows[index] })) }
}
function sqliteCommand(executable, args, { input } = {}) {
  assert.equal(executable, 'sqlite3')
  return execFileSync(executable, args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
}
const sqliteQuery = (path, sql) => JSON.parse(sqliteCommand('sqlite3', ['-safe', '-json', path, sql]).trim() || '[]')
const progress = message => console.log(`${message} (${Math.round((performance.now() - started) / 1000)}秒)`)

try {
  for (const name of readdirSync(source).filter(name => name.endsWith('.sql') && name < '0009').sort()) stage(name)
  apply()
  execute(readFileSync('tests/fixtures/household-migration.sql', 'utf8') + "\nUPDATE ai_diagnoses SET run_token=NULL WHERE id='diagnosis';")
  for (const name of readdirSync(source).filter(name => name >= '0009' && name < '0013').sort()) stage(name)
  apply()
  const before = snapshot()
  progress('非空0012 fixtureを準備')

  // コピー済み・旧親DROP後・rename途中・trigger復元前をそれぞれ故障させる。
  for (const point of [
    'INSERT INTO payment_operations_new (',
    'DROP TABLE sessions;',
    'ALTER TABLE payment_records_new RENAME TO payment_records;',
    '-- 旧索引・triggerを同じ定義で復元する。',
  ]) {
    assert.ok(migration.includes(point))
    writeFileSync(join(migrations, filename), migration.replace(point, 'INSERT INTO _identity_migration_assert VALUES(0);\n' + point))
    assert.throws(apply, /CHECK constraint failed/)
    assert.deepEqual(snapshot(), before, `${point}でDDL/全行/適用台帳を保持`)
  }
  stage(filename)
  apply()
  const after = snapshot()
  assertD1RemoteTriggerSyntax(after.schema.filter(row => row.type === 'trigger'))
  for (const table of before.rows.filter(row => row.table !== 'd1_migrations')) {
    const columns = Object.keys(table.rows[0] ?? {})
    const actual = after.rows.find(row => row.table === table.table).rows
    assert.deepEqual(actual.map(row => Object.fromEntries(columns.map(column => [column, row[column]]))), table.rows, table.table)
  }
  assert.deepEqual(execute('PRAGMA foreign_key_check;'), [[]])
  progress('0013の全保持値と4箇所のDDL/data/台帳rollback・再試行を確認')

  execute(readFileSync('tests/fixtures/google-identity.sql', 'utf8'))
  // 清掃済み試行の番号が残存行のMAXを超えていても、復元後に採番を巻き戻さない。
  execute(`INSERT INTO oauth_login_attempts(sequence,id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at)
    VALUES(100,'cleaned',printf('%064d',1),printf('%064d',100),'n','v','2026-09-06','2099-01-01');
    UPDATE users SET session_epoch=1,oauth_attempt_floor=100 WHERE id='user-b';
    DELETE FROM oauth_login_attempts WHERE id='cleaned';`)
  const exported = snapshot()
  const exportPath = join(temp, 'identity.sql')
  run(['export', 'identity-test', '--output', exportPath])
  const evidence = readBackupSchema(sql => execute(sql)[0])
  assert.equal(evidence.stage, '0013')
  assert.equal(evidence.tables.length, 21)

  const expected = createExpectedBackupSchema(evidence.migrations, join(temp, 'expected.sqlite'), sqliteCommand)
  assert.deepEqual(expected, evidence, '空DBから期待DDLを生成できる')
  const restoredPath = join(temp, 'restored.sqlite')
  const restored = restoreAndInspectBackup(readFileSync(exportPath), restoredPath, sqliteCommand)
  assert.deepEqual(restored.schema, evidence)
  assert.deepEqual(restored.countRows, execute(buildCountSql(evidence.tables))[0])
  for (const { table, rows } of exported.rows) {
    assert.deepEqual(sqliteQuery(restoredPath, `SELECT * FROM ${quote(table)} ORDER BY rowid;`), rows, `SQLite復元の${table}`)
  }
  const nextAttempt = `INSERT INTO oauth_login_attempts(id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at)
    VALUES('after-restore',printf('%064d',1),printf('%064d',101),'n','v','2026-09-06','2099-01-01') RETURNING sequence;`
  assert.equal(sqliteQuery(restoredPath, nextAttempt)[0].sequence, 101)
  progress('21表の実export→SQLite復元・全保存値/DDL/FK・採番を確認')

  state = join(temp, 'restored-state')
  run(['execute', 'identity-test', '--file', exportPath])
  assert.deepEqual(snapshot(), exported, '別隔離D1へ全保存値を復元')
  assert.deepEqual(execute('PRAGMA foreign_key_check;'), [[]])
  assert.equal(execute(nextAttempt)[0][0].sequence, 101)
  for (const table of ['payment_operations', 'payment_records', 'payment_voids']) {
    assert.throws(() => execute(`UPDATE ${table} SET created_at='changed';`), /PAYMENT_IMMUTABLE/)
    assert.throws(() => execute(`DELETE FROM ${table};`), /PAYMENT_IMMUTABLE/)
  }
  // 旧コードの列指定INSERTは追加schemaでも成功する。
  execute("INSERT INTO sessions(token,person,auth_method,expires_at,created_at,household_id) VALUES(printf('%064d',99),NULL,'password','2099-01-01','2026-09-06','3975b870-bbfa-49fd-ae3d-d273c9f6e107');")
  assert.deepEqual(execute("SELECT user_id,membership_id,session_epoch,oauth_attempt_sequence FROM sessions WHERE token=printf('%064d',99);"), [[{ user_id: null, membership_id: null, session_epoch: null, oauth_attempt_sequence: null }]])
  progress('別隔離D1の復元後も採番・台帳保護・旧認証SQL互換を確認')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
