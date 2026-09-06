import assert from 'node:assert/strict'
import './test-google-auth-admin-transport.mjs'
import './test-legacy-finalization-d1.mjs'
import { createHash } from 'node:crypto'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { createWranglerDatabase, approveFromVerifiedRequest, inspectRequest } from './google-auth-admin.mjs'

// Node専用の検証入口。実環境のbindingや設定を読まず、毎回独立したD1だけを使う。
const temp = await mkdtemp(join(tmpdir(), 'google-auth-d1-'))
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
  compatibilityDate: '2026-07-08', d1Databases: { DB: 'google-auth-fixture' }, d1Persist: false })
try {
  const output = join(temp, 'auth.mjs')
  await build({ stdin: { contents: `
    export * from './cloudflare/worker/src/oauth-attempts.ts'
    export * from './cloudflare/worker/src/google-login.ts'
    export * from './cloudflare/worker/src/google-migrations.ts'
    export * from './cloudflare/worker/src/google-revocation.ts'
    export * from './cloudflare/worker/src/sessions.ts'
  `, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: output })
  const api = await import(pathToFileURL(output).href)
  const db = await mf.getD1Database('DB')
  for (const name of (await readdir('cloudflare/worker/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = (await readFile(`cloudflare/worker/migrations/${name}`, 'utf8')).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ')
    await db.exec(sql)
  }
  const runtime = { randomUUID: () => crypto.randomUUID(), now: () => new Date() }
  const identity = subject => ({ issuer: 'https://accounts.google.com', subject, email: `${subject}@example.com` })
  const attempt = async () => {
    const input = { state: crypto.randomUUID() + 'state-padding', nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43), browserBinding: 'b'.repeat(64) }
    const created = await api.createOAuthAttempt(db, runtime, input)
    return { attemptId: created.attemptId, state: input.state, browserBinding: input.browserBinding }
  }
  const claim = async () => api.claimOAuthAttempt(db, runtime, await attempt())
  const login = async subject => api.completeGoogleLogin(db, runtime, await claim(), identity(subject))
  const pending = async subject => {
    const result = await login(subject)
    assert.equal(result.kind, 'migration_pending')
    return result
  }
  // remote通信せず、CLIが作るSQLファイルを隔離D1へ渡して実ドメインとの配線を検証する。
  const adminDb = createWranglerDatabase({ database_id: 'local-fixture' }, 'dev', temp, async args => {
    const sql = await readFile(args[args.indexOf('--file') + 1], 'utf8')
    const result = await db.prepare(sql).all()
    return [{ success: result.success, results: result.results }]
  })
  const approve = async (request, slot) => {
    const inspection = await inspectRequest(adminDb, { code: request.code, householdId: '3975b870-bbfa-49fd-ae3d-d273c9f6e107' })
    assert.equal(inspection.requests[0].requestId, request.requestId)
    return approveFromVerifiedRequest(adminDb, api, 'approve-migration', {
    requestId: request.requestId, code: request.code, approvedBy: 'fixture-operator', confirmationRef: 'fixture-checked',
    householdId: '3975b870-bbfa-49fd-ae3d-d273c9f6e107', legacySlot: slot, defaultPerson: slot === 'existing-member-1' ? 'husband' : 'wife',
    })
  }
  const count = async table => (await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n
  const expiredApproval = async session => {
    const clock = Date.now()
    const requestId = crypto.randomUUID()
    const subject = crypto.randomUUID()
    const code = crypto.randomUUID() + 'code-padding'
    const hash = value => createHash('sha256').update(value).digest('hex')
    await db.prepare(`INSERT INTO google_migration_requests(id,purpose,issuer,subject,email,code_hash,browser_binding_hash,created_at,expires_at)
      VALUES(?,'legacy_enrollment',?,?,?,?,?,?,?)`).bind(requestId, identity(subject).issuer, subject, identity(subject).email,
      hash(code), hash('browser-fixture'), new Date(clock - 12 * 60_000).toISOString(), new Date(clock + 18 * 60_000).toISOString()).run()
    const approvalRuntime = { ...runtime, now: () => new Date(clock - 11 * 60_000) }
    if (session) {
      const old = await db.prepare('SELECT id FROM google_identities WHERE user_id=? AND revoked_at IS NULL').bind(session.userId).first()
      await api.approveGoogleRecovery(db, approvalRuntime, { requestId, code, approvedBy: 'fixture', confirmationRef: 'checked',
        targetUserId: session.userId, expectedOldIdentityId: old.id, expectedEpoch: session.sessionEpoch })
    } else await api.approveGoogleMigration(db, approvalRuntime, { requestId, code, approvedBy: 'fixture', confirmationRef: 'checked',
      householdId: '3975b870-bbfa-49fd-ae3d-d273c9f6e107', legacySlot: 'existing-member-1', defaultPerson: 'husband' })
    const currentClaim = await claim()
    const snapshot = () => Promise.all(['users', 'google_identities', 'household_memberships', 'sessions'].map(async table => (await db.prepare(`SELECT * FROM ${table}`).all()).results))
    const before = await snapshot()
    await assert.rejects(api.completeGoogleLogin(db, { ...runtime, now: () => new Date(clock - 2 * 60_000) }, currentClaim, identity(subject)),
      error => error.code === 'operation_failed')
    assert.deepEqual(await snapshot(), before)
    assert.equal((await db.prepare('SELECT status FROM oauth_login_attempts WHERE id=?').bind(currentClaim.attemptId).first()).status, 'processing')
    assert.equal((await db.prepare('SELECT status FROM google_migration_requests WHERE id=?').bind(requestId).first()).status, 'approved')
  }
  await expiredApproval(null)

  const credentials = await attempt()
  const claims = await Promise.allSettled([api.claimOAuthAttempt(db, runtime, credentials), api.claimOAuthAttempt(db, runtime, credentials)])
  assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1)

  const aRequest = await pending('a')
  assert.equal(await count('users'), 0)
  assert.equal(await api.getGoogleMigrationRequest(db, runtime, aRequest.requestId, 'x'.repeat(64)), null)
  await approve(aRequest, 'existing-member-1')
  // 読取を両方済ませてから同じ承認を消費し、1 batchだけを成功させる。
  const [aClaim, otherClaim] = await Promise.all([claim(), claim()])
  let entered = 0
  let release
  const barrier = new Promise(resolve => { release = resolve })
  const raceDb = { prepare: query => db.prepare(query), batch: async statements => {
    if (++entered === 2) release()
    await barrier
    return db.batch(statements)
  } }
  const enrolled = await Promise.allSettled([api.completeGoogleLogin(raceDb, runtime, aClaim, identity('a')),
    api.completeGoogleLogin(raceDb, runtime, otherClaim, identity('a'))])
  assert.equal(enrolled.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(await count('users'), 1)
  const a = enrolled.find(result => result.status === 'fulfilled').value.session
  const bRequest = await pending('b')
  await approve(bRequest, 'existing-member-2')
  // batch中間の失敗がclaim/承認/userを全て戻す。
  await db.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON household_memberships BEGIN SELECT RAISE(ABORT,'fixture-internal-detail'); END;")
  await assert.rejects(login('b'), error => error.code === 'operation_failed' && !String(error).includes('fixture-internal-detail'))
  assert.equal(await count('users'), 1)
  assert.equal((await db.prepare('SELECT status FROM google_migration_requests WHERE id=?').bind(bRequest.requestId).first()).status, 'approved')
  await db.exec('DROP TRIGGER fixture_fail;')
  const b = (await login('b')).session
  const oldClaim = await claim()
  await api.revokeGoogleSessions(db, runtime, a.token)
  assert.equal(await api.getSession(db, a.token), null)
  assert.equal((await api.getSession(db, b.token)).userId, b.userId)
  await assert.rejects(api.completeGoogleLogin(db, runtime, oldClaim, identity('a')), error => error.code === 'operation_failed')
  const fresh = (await login('a')).session
  assert.equal(fresh.userId, a.userId)
  assert.equal(fresh.sessionEpoch, 1)

  const recovery = await pending('replacement')
  const beforeLogout = await claim()
  await api.revokeGoogleSessions(db, runtime, fresh.token)
  const oldIdentity = await db.prepare('SELECT id FROM google_identities WHERE user_id=? AND revoked_at IS NULL').bind(a.userId).first()
  const revokedAt = new Date(Date.now() - 60_000).toISOString()
  await db.prepare('UPDATE google_identities SET revoked_at=? WHERE id=?').bind(revokedAt, oldIdentity.id).run()
  await approveFromVerifiedRequest(adminDb, api, 'approve-recovery', { requestId: recovery.requestId, code: recovery.code,
    approvedBy: 'fixture-operator', confirmationRef: 'fixture-checked', targetUserId: a.userId,
    expectedOldIdentityId: oldIdentity.id, expectedEpoch: 2 })
  await assert.rejects(api.completeGoogleLogin(db, runtime, beforeLogout, identity('replacement')), error => error.code === 'operation_failed')
  const beforeRecovery = await db.prepare('SELECT * FROM users WHERE id=?').bind(a.userId).first()
  const ignoredClaim = await claim()
  await db.exec("CREATE TRIGGER fixture_ignore_consumed BEFORE UPDATE OF status ON google_migration_requests WHEN NEW.status='consumed' BEGIN SELECT RAISE(IGNORE); END;")
  await assert.rejects(api.completeGoogleLogin(db, runtime, ignoredClaim, identity('replacement')), error => error.code === 'operation_failed')
  assert.deepEqual(await db.prepare('SELECT * FROM users WHERE id=?').bind(a.userId).first(), beforeRecovery)
  assert.equal((await db.prepare('SELECT status FROM oauth_login_attempts WHERE id=?').bind(ignoredClaim.attemptId).first()).status, 'processing')
  assert.equal((await db.prepare('SELECT status FROM google_migration_requests WHERE id=?').bind(recovery.requestId).first()).status, 'approved')
  assert.equal((await db.prepare('SELECT revoked_at FROM google_identities WHERE id=?').bind(oldIdentity.id).first()).revoked_at, revokedAt)
  assert.equal(await count('google_identities'), 2)
  await db.exec('DROP TRIGGER fixture_ignore_consumed;')
  assert.deepEqual(await login('replacement'), { kind: 'recovered', userId: a.userId })
  assert.equal((await db.prepare('SELECT revoked_at FROM google_identities WHERE id=?').bind(oldIdentity.id).first()).revoked_at, revokedAt)
  assert.equal(await count('users'), 2)
  assert.equal(await count('household_memberships'), 2)
  await assert.rejects(login('a'), error => error.code === 'identity_denied')
  assert.equal((await login('replacement')).session.userId, a.userId)
  assert.equal((await api.getSession(db, b.token)).userId, b.userId)
  await expiredApproval(b)
  console.log('Google認証D1検証成功: 全migration・同時claim/承認消費・2名移行・batch rollback・本人失効・partner継続・復旧floor・事前失効保持・consumed更新0件rollback・DB時計の承認期限・CLI共通ドメイン/SQL転送・同user保持')
} finally {
  await mf.dispose()
  await rm(temp, { recursive: true, force: true })
}
