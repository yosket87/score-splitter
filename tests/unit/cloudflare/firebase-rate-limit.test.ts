import { afterEach, expect, it } from 'vitest'
import { createFirebaseSqlite } from '../../helpers/firebase-sqlite'
import { reserveFirebaseExchange } from '../../../cloudflare/worker/src/firebase-rate-limit'
import { completeFirebaseLogin } from '../../../cloudflare/worker/src/firebase-login'
const contexts: ReturnType<typeof createFirebaseSqlite>[] = []
function setup() { const context = createFirebaseSqlite({ fixture: false }); contexts.push(context); return context }
afterEach(() => contexts.splice(0).forEach(context => context.sqlite.close()))

it('同じ接続元の同時要求は15分で30件まで、別キーと次の時間枠は独立', async () => {
  const { db } = setup()
  let now = Date.now()
  const runtime = { now: () => new Date(now), randomUUID: () => crypto.randomUUID() }
  const results = await Promise.all(Array.from({ length: 35 }, () => reserveFirebaseExchange(db, runtime, 'a'.repeat(64))))
  expect(results.filter(Boolean)).toHaveLength(30)
  expect(await reserveFirebaseExchange(db, runtime, 'b'.repeat(64))).toBe(true)
  now += 15 * 60_000
  expect(await reserveFirebaseExchange(db, runtime, 'a'.repeat(64))).toBe(true)
})

it('同じ未知UIDの同時申請は15分で5件に制限し、他UIDは独立', async () => {
  const { db } = setup()
  const now = Math.floor(Date.now() / 1000)
  const runtime = { now: () => new Date(), randomUUID: () => crypto.randomUUID() }
  const identity = { projectId: 'test-project', uid: 'unknown-uid', provider: 'google.com' as const,
    email: null, authTime: now, issuedAt: now, expiresAt: now + 3600 }
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => completeFirebaseLogin(db, runtime, identity, { mode: 'login' })))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5)
  expect(await db.prepare('SELECT COUNT(*) AS count FROM firebase_migration_requests').first()).toEqual({ count: 5 })
  expect((await completeFirebaseLogin(db, runtime, { ...identity, uid: 'other-uid' }, { mode: 'login' })).kind).toBe('migration_pending')
})
