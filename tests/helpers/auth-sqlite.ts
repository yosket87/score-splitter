import { createRequire } from 'node:module'
import type { SQLInputValue } from 'node:sqlite'
import type { D1DatabaseLike, D1PreparedStatementLike } from '../../cloudflare/worker/src/d1'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

export function createAuthSqlite() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE households (id TEXT PRIMARY KEY, legacy_auth_key TEXT UNIQUE, created_at TEXT);
    INSERT INTO households VALUES ('A', 'legacy', '2026-01-01'), ('B', NULL, '2026-01-01');
    CREATE TABLE sessions (token TEXT PRIMARY KEY, person TEXT, auth_method TEXT, expires_at TEXT, created_at TEXT, household_id TEXT);
    CREATE TABLE passkey_credentials (id TEXT PRIMARY KEY, person TEXT, public_key_base64 TEXT, counter INTEGER, device_name TEXT, transports TEXT, created_at TEXT, household_id TEXT);
    CREATE TABLE webauthn_challenges (id TEXT PRIMARY KEY, challenge TEXT, type TEXT, person TEXT, expires_at TEXT, created_at TEXT, household_id TEXT);
  `)
  const statement = (query: string, params: SQLInputValue[]): D1PreparedStatementLike => ({
    bind: (...values) => statement(query, values as SQLInputValue[]),
    first: async <T>() => (sqlite.prepare(query).get(...params) ?? null) as T | null,
    all: async <T>() => ({ results: sqlite.prepare(query).all(...params) as T[] }),
    run: async () => ({ success: true, meta: { changes: Number(sqlite.prepare(query).run(...params).changes) } }),
  })
  const db: D1DatabaseLike = {
    prepare: (query) => statement(query, []),
    batch: async (statements) => Promise.all(statements.map((item) => item.run())),
  }
  return { sqlite, db }
}
