import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import type { SQLInputValue } from 'node:sqlite'
import type { D1DatabaseLike, D1PreparedStatementLike } from '../../cloudflare/worker/src/d1'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
export const householdA = { householdId: '3975b870-bbfa-49fd-ae3d-d273c9f6e107' }
export const householdB = { householdId: 'household-b' }
export function createHouseholdDataSqlite() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  const directory = 'cloudflare/worker/migrations/'
  for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(readFileSync(directory + file, 'utf8'))
  sqlite.prepare('INSERT INTO households(id,created_at) VALUES(?,?)').run(householdB.householdId, 'now')
  sqlite.prepare("INSERT INTO ai_execution_guard(household_id,id,usage_date,daily_count,updated_at) VALUES(?,1,'1970-01-01',0,'now')").run(householdB.householdId)
  sqlite.prepare("INSERT INTO ai_diagnosis_source_revision(household_id,id,revision,updated_at) VALUES(?,1,0,'now')").run(householdB.householdId)
  const changes = () => Number(sqlite.prepare('SELECT total_changes() n').get()?.n)
  const statement = (query: string, params: SQLInputValue[]): D1PreparedStatementLike => ({
    bind: (...values) => statement(query, values as SQLInputValue[]),
    first: async <T>() => (sqlite.prepare(query).get(...params) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(query).all(...params) as T[] }),
    run: async () => {
      const before = changes()
      const prepared = sqlite.prepare(query)
      const results = /^SELECT\b/i.test(query.trim()) || /RETURNING\s+id\s*$/i.test(query) ? prepared.all(...params) : (prepared.run(...params), [])
      return { success: true, results, meta: { changes: changes() - before } }
    },
  })
  const db: D1DatabaseLike = {
    prepare: query => statement(query, []),
    batch: async statements => {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const item of statements) results.push(await item.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  return { sqlite, db }
}
