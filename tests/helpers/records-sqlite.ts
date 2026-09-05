import { createAuthSqlite } from './auth-sqlite'
import type { SQLInputValue } from 'node:sqlite'
import type { D1DatabaseLike, D1PreparedStatementLike } from '../../cloudflare/worker/src/d1'

export function createRecordsSqlite() {
  const { sqlite } = createAuthSqlite()
  for (const table of ['incomes', 'expenses', 'carryovers']) {
    sqlite.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, month TEXT, label TEXT, amount INTEGER, person TEXT, created_at TEXT, updated_at TEXT, is_carryover INTEGER DEFAULT 0, is_cleared INTEGER DEFAULT 0, ai_category TEXT, ai_category_source TEXT, ai_categorized_at TEXT)`)
  }
  const statement = (query: string, params: SQLInputValue[]): D1PreparedStatementLike => ({
    bind: (...values) => statement(query, values as SQLInputValue[]),
    first: async <T>() => (sqlite.prepare(query).get(...params) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(query).all(...params) as T[] }),
    run: async () => {
      const prepared = sqlite.prepare(query)
      if (/RETURNING id$/.test(query.trim()) || /^SELECT\b/i.test(query.trim()) || /SELECT status FROM validation$/.test(query.trim())) {
        const results = prepared.all(...params)
        return { success: true, results, meta: { changes: /RETURNING id$/.test(query.trim()) ? results.length : 0 } }
      }
      return { success: true, meta: { changes: Number(prepared.run(...params).changes) } }
    },
  })
  const db: D1DatabaseLike = {
    prepare: (query) => statement(query, []),
    batch: async (statements) => {
      sqlite.exec('BEGIN')
      try {
        const result = []
        for (const item of statements) result.push(await item.run())
        sqlite.exec('COMMIT')
        return result
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { sqlite, db }
}
