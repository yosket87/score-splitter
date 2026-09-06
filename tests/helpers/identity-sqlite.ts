import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import type { SQLInputValue } from 'node:sqlite'
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from '../../cloudflare/worker/src/d1'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
export const identityMigration = '0013_add_google_identities.sql'
export const legacyHouseholdId = '3975b870-bbfa-49fd-ae3d-d273c9f6e107'
const directory = 'cloudflare/worker/migrations/'

export function createIdentitySqlite({ migrate = true, fixture = true } = {}) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA legacy_alter_table=OFF;')
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql') && name < '0013').sort()) {
    sqlite.exec(readFileSync(directory + name, 'utf8'))
    if (fixture && name.startsWith('0008')) {
      sqlite.exec(readFileSync('tests/fixtures/household-migration.sql', 'utf8'))
      sqlite.exec("UPDATE ai_diagnoses SET run_token=NULL WHERE id='diagnosis'")
    }
  }
  const apply = (sql = readFileSync(directory + identityMigration, 'utf8')) => {
    sqlite.exec('BEGIN')
    try { sqlite.exec(sql); sqlite.exec('COMMIT') } catch (error) { sqlite.exec('ROLLBACK'); throw error }
  }
  if (migrate) apply()
  const executions = new WeakMap<D1PreparedStatementLike, () => D1ResultLike>()
  const statement = (sql: string, params: SQLInputValue[]): D1PreparedStatementLike => {
    const execute = () => {
      const prepared = sqlite.prepare(sql)
      // Node 22の全対応版で利用でき、列なしの更新も空配列を返す。
      const results = prepared.all(...params)
      return { success: true, results, meta: { changes: Number(sqlite.prepare('SELECT changes() n').get()?.n) } }
    }
    const prepared: D1PreparedStatementLike = {
      bind: (...values) => statement(sql, values as SQLInputValue[]),
      first: async <T>() => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
      all: async <T>() => ({ results: sqlite.prepare(sql).all(...params) as T[] }),
      run: async () => execute(),
    }
    executions.set(prepared, execute)
    return prepared
  }
  const db: D1DatabaseLike = {
    prepare: sql => statement(sql, []),
    batch: async statements => {
      sqlite.exec('BEGIN')
      try {
        // 同一SQLite接続のtransaction内でawaitせず、別batchの割込みを防ぐ。
        const results = statements.map(item => {
          const execute = executions.get(item)
          if (!execute) throw new Error('別のDBのstatementはbatchへ渡せません')
          return execute()
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  return { sqlite, db, apply }
}

export function identitySnapshot(sqlite: ReturnType<typeof createIdentitySqlite>['sqlite']) {
  const schema = sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name").all()
  const rows = schema.filter(row => row.type === 'table').map(row => ({
    table: String(row.name), rows: sqlite.prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}" ORDER BY rowid`).all(),
  }))
  return { schema, rows }
}
