import type { D1DatabaseLike, Runtime } from './d1'
import { authOperation, hashSecret, secret } from './google-auth-shared'
import { getGoogleMigrationRequest } from './google-migrations'
import { getSession } from './sessions'

export function getGoogleAccount(db: D1DatabaseLike, token: string) {
  return authOperation(async () => {
    const session = await getSession(db, token)
    if (session?.authMethod !== 'google') return null
    return db.prepare('SELECT email FROM google_identities WHERE user_id=? AND revoked_at IS NULL')
      .bind(session.userId).first<{ email: string | null }>()
  })
}
export function getGoogleMigrationDisplay(db: D1DatabaseLike, runtime: Runtime, requestId: string, browserSecret: string, code: string) {
  return authOperation(async () => {
    const display = await getGoogleMigrationRequest(db, runtime, requestId, browserSecret)
    if (!display) return null
    const match = await db.prepare('SELECT id FROM google_migration_requests WHERE id=? AND code_hash=?')
      .bind(requestId, await hashSecret(secret.parse(code))).first()
    return match ? { ...display, code } : null
  })
}
