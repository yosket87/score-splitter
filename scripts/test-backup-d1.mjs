import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import {
  BACKUP_MIGRATIONS,
  SCHEMA_TABLES_SQL,
  SCHEMA_MIGRATIONS_SQL,
  SCHEMA_OBJECTS_SQL,
  buildCountSql,
  createExpectedBackupSchema,
  readBackupSchema,
} from './backup-schema.mjs'
import { restoreAndInspectBackup } from './backup-sqlite.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'backup-d1-'))
const sourcePath = path.join(temporaryDirectory, 'fixture.sqlite')
const restoredPath = path.join(temporaryDirectory, 'restored.sqlite')

function runSqlite(executable, args, { input } = {}) {
  assert.equal(executable, 'sqlite3')
  const result = spawnSync(executable, args, { input, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

function querySqlite(databasePath, sql) {
  return JSON.parse(runSqlite('sqlite3', ['-safe', '-json', databasePath, sql]).trim() || '[]')
}

const quoteIdentifier = (name) => `"${name.replaceAll('"', '""')}"`

// 本番設定や認証情報を使わず、毎回独立したローカルD1のexportを検証する。
const mf = new Miniflare({
  modules: true,
  script: 'export default {}',
  compatibilityDate: '2026-07-08',
  d1Databases: { DB: 'backup-export-test' },
  d1Persist: false,
})

try {
  const migrations = BACKUP_MIGRATIONS.slice(0, 8)
  const migrationSql = migrations.map(({ name }) => readFileSync(
    path.join(repositoryRoot, 'cloudflare/worker/migrations', name), 'utf8'
  )).join('\n')
  const fixtureSql = `${migrationSql}
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    ${migrations.map(({ name }, index) => `INSERT INTO d1_migrations VALUES (${index + 1}, '${name}');`).join('\n')}
    INSERT INTO incomes VALUES ('income', '202609', '給与', 31000, 'husband', 'now', 'now');
    INSERT INTO ai_diagnoses VALUES ('diagnosis', '202609', '{"summary":"空白  保持 -- /* 引用 */"}', 'hash', 'v1', NULL, NULL, 'now', 'now');
    INSERT INTO payment_operations VALUES ('operation', '202609', 'record', 1, '{}', '{}', NULL, 'password', 'now');
    INSERT INTO payment_records VALUES ('record', 'operation', '202609', 15500, '2026-09-05', 'now', '{"label":"空白  保持 -- /* 引用 */"}', 'v1', 'v1');
    UPDATE month_payment_revisions SET revision = revision + 1 WHERE month = '202609';
    INSERT INTO payment_operations VALUES ('void-operation', '202609', 'void', 2, '{"paymentId":"record"}', '{}', 'wife', 'passkey', 'now');
    INSERT INTO payment_voids VALUES ('void', 'void-operation', 'record', '重複振込の取消', 'now');
    UPDATE month_payment_revisions SET revision = revision + 1 WHERE month = '202609';
    UPDATE ai_execution_guard SET daily_count = 3, usage_date = '2026-09-05' WHERE id = 1;
  `
  runSqlite('sqlite3', ['-safe', '-bail', sourcePath], { input: fixtureSql })
  chmodSync(sourcePath, 0o600)

  const db = await mf.getD1Database('DB')
  // SQLiteが解析した完成DDLを1文ずつD1へ渡す。SQL本文を正規表現で加工しない。
  const tables = querySqlite(sourcePath, "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid;")
  for (const { name, sql } of tables) {
    await db.prepare(sql).run()
    for (const row of querySqlite(sourcePath, `SELECT * FROM ${quoteIdentifier(name)};`)) {
      const columns = Object.keys(row)
      await db.prepare(`INSERT INTO ${quoteIdentifier(name)} (${columns.map(quoteIdentifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
        .bind(...columns.map((column) => row[column])).run()
    }
  }
  for (const { sql } of querySqlite(sourcePath, "SELECT sql FROM sqlite_schema WHERE type IN ('index', 'trigger', 'view') AND sql IS NOT NULL ORDER BY type, name;")) {
    await db.prepare(sql).run()
  }

  const schemaRows = new Map()
  for (const sql of [SCHEMA_TABLES_SQL, SCHEMA_MIGRATIONS_SQL, SCHEMA_OBJECTS_SQL]) {
    schemaRows.set(sql, (await db.prepare(sql).all()).results)
  }
  const remoteSchema = readBackupSchema((sql) => {
    assert.ok(schemaRows.has(sql), `未知のschema query: ${sql}`)
    return schemaRows.get(sql)
  })
  assert.equal(remoteSchema.tables.length, 15)
  assert.ok(remoteSchema.objects.length > 15)
  const expectedSchema = createExpectedBackupSchema(
    remoteSchema.migrations, path.join(temporaryDirectory, 'expected.sqlite'), runSqlite
  )
  assert.deepEqual(remoteSchema, expectedSchema)

  // Wranglerのlocal exportと同じMiniflare入口を利用する。
  const exported = await db.prepare('PRAGMA miniflare_d1_export(?,?,?);').bind(false, false).raw()
  const dump = Buffer.from(exported[0].join('\n'))
  const restored = restoreAndInspectBackup(dump, restoredPath, runSqlite)
  assert.deepEqual(restored.schema, remoteSchema)
  assert.deepEqual(restored.countRows, (await db.prepare(buildCountSql(remoteSchema.tables)).all()).results)
  assert.equal(restored.integrityCheck, 'ok')
  assert.deepEqual(restored.foreignKeyCheck, [])

  for (const table of remoteSchema.tables) {
    const sql = `SELECT * FROM ${quoteIdentifier(table)} ORDER BY rowid;`
    assert.deepEqual(querySqlite(restoredPath, sql), (await db.prepare(sql).all()).results, `${table}の全保存値`)
  }
  const immutablePaymentTables = ['payment_operations', 'payment_records', 'payment_voids']
  for (const table of immutablePaymentTables) {
    assert.ok(querySqlite(restoredPath, `SELECT 1 FROM ${quoteIdentifier(table)} LIMIT 1;`).length > 0, `${table}が非空`)
    assert.throws(
      () => runSqlite('sqlite3', ['-safe', restoredPath, `UPDATE ${quoteIdentifier(table)} SET created_at = 'changed';`]),
      /PAYMENT_IMMUTABLE/,
      `${table}のUPDATE禁止`
    )
    assert.throws(
      () => runSqlite('sqlite3', ['-safe', restoredPath, `DELETE FROM ${quoteIdentifier(table)};`]),
      /PAYMENT_IMMUTABLE/,
      `${table}のDELETE禁止`
    )
  }
  console.log('バックアップD1検証成功: 実export・15表・定義・全保存値・FK・振込履歴保護')
} finally {
  try {
    await mf.dispose()
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}
