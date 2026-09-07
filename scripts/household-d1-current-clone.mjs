import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { Miniflare } from 'miniflare'
import { verifyHouseholdFunctions } from './household-d1-boundaries.mjs'

const databaseId = '00000000-0000-0000-0000-000000000001'
const quote = name => `"${name.replaceAll('"', '""')}"`
async function withDatabase(state, operation) {
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-07-08', d1Databases: { DB: databaseId }, d1Persist: join(state, 'v3/d1') })
  try { return await operation(await mf.getD1Database('DB')) }
  finally { await mf.dispose() }
}
async function captureStoredColumns(db) {
  const tables = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_cf_METADATA' ORDER BY name").all()).results
  return Promise.all(tables.map(async ({ name }) => ({
    name,
    columns: (await db.prepare(`PRAGMA table_info(${quote(name)})`).all()).results.map(column => column.name),
    rows: (await db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all()).results,
  })))
}
async function assertStoredColumnsPreserved(db, before) {
  for (const table of before) {
    const rows = (await db.prepare(`SELECT ${table.columns.map(quote).join(',')} FROM ${quote(table.name)} ORDER BY rowid`).all()).results
    // 台帳には正規migrationだけが追記される。既存台帳行の値は変えない。
    assert.deepEqual(table.name === 'd1_migrations' ? rows.slice(0, table.rows.length) : rows, table.rows, table.name)
  }
  assert.equal((await db.prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1').first()).name, '0013_add_google_identities.sql')
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
}

// 歴史DDLの検証元は変更しない。接続を閉じたSQLite stateを丸ごとcloneし、
// 現APIの前提schemaへの正規migrationだけをcloneに適用する。
export async function verifyCurrentHouseholdClone(temp, sourceState, restored, sourceSnapshot) {
  const clone = mkdtempSync(join(temp, 'current-api-clone-'))
  const state = join(clone, 'state')
  const migrations = join(clone, 'migrations')
  const config = join(clone, 'wrangler.json')
  try {
    cpSync(sourceState, state, { recursive: true })
    mkdirSync(migrations)
    const before = await withDatabase(state, async db => {
      const schema = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).results
      assert.deepEqual(schema, sourceSnapshot.schema)
      const stored = await captureStoredColumns(db)
      for (const table of stored) assert.deepEqual(table.rows, sourceSnapshot.rows[table.name], `clone元値: ${table.name}`)
      return stored
    })
    // 元suiteの故障注入済みSQLをコピーしない。repositoryの正規SQLを使う。
    const source = resolve('cloudflare/worker/migrations')
    for (const name of readdirSync(source).filter(name => name.endsWith('.sql') && name <= '0013_add_google_identities.sql').sort()) {
      writeFileSync(join(migrations, name), readFileSync(join(source, name)))
    }
    writeFileSync(config, JSON.stringify({ name: 'household-current-api-clone', compatibility_date: '2026-07-08',
      d1_databases: [{ binding: 'DB', database_name: 'household-clone', database_id: databaseId, migrations_dir: migrations }] }))
    execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'household-clone',
      '--local', '--config', config, '--persist-to', state], { cwd: clone, stdio: 'pipe',
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(clone, 'logs') } })
    await withDatabase(state, db => assertStoredColumnsPreserved(db, before))
    await verifyHouseholdFunctions(clone, state, restored)
    console.log(`現API専用clone: ${restored ? '0012復元' : '0012故障後の0011'}→正規0013、旧全列全値保持・現共有関数成功`)
  } finally { rmSync(clone, { recursive: true, force: true }) }
}
