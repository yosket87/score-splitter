import { readFileSync } from 'node:fs'
import { createIdentitySqlite } from './identity-sqlite'
export const firebaseMigration = '0014_add_firebase_auth.sql'
export function createFirebaseSqlite({ migrate = true, fixture = true } = {}) {
  const context = createIdentitySqlite({ fixture })
  if (fixture) context.sqlite.exec(readFileSync('tests/fixtures/google-identity.sql', 'utf8'))
  const applyFirebase = (sql = readFileSync(`cloudflare/worker/migrations/${firebaseMigration}`, 'utf8')) => context.apply(sql)
  if (migrate) applyFirebase()
  return { ...context, applyFirebase }
}
