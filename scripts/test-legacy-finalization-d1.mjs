import assert from 'node:assert/strict'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { createWranglerDatabase, executeFinalizationCommand } from './google-auth-admin.mjs'

const temp = await mkdtemp(join(tmpdir(), 'legacy-finalization-'))
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}',
  compatibilityDate: '2026-07-08', d1Databases: { DB: 'finalization-fixture' }, d1Persist: false })
try {
  const output = join(temp, 'api.mjs')
  await build({ stdin: { contents: `export * from './tests/helpers/google-finalization';
    export * from './cloudflare/worker/src/google-finalization'; export * from './cloudflare/worker/src/sessions';
    export * from './cloudflare/worker/src/passkeys'; export * from './cloudflare/worker/src/challenges';
    export * from './cloudflare/worker/src/auth-router'; export * from './cloudflare/worker/src/google-revocation';
    export * from './cloudflare/worker/src/oauth-attempts'; export * from './cloudflare/worker/src/google-login';`,
    resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: output })
  const api = await import(pathToFileURL(output).href)
  const db = await mf.getD1Database('DB')
  const execFile = async path => db.exec((await readFile(path, 'utf8')).split('\n').filter(line => !line.trimStart().startsWith('--')).join(' '))
  for (const name of (await readdir('cloudflare/worker/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    await execFile(`cloudflare/worker/migrations/${name}`)
    if (name.startsWith('0008')) { await execFile('tests/fixtures/household-migration.sql'); await db.exec("UPDATE ai_diagnoses SET run_token=NULL WHERE id='diagnosis'") }
  }
  const runtime = { randomUUID: () => crypto.randomUUID(), now: () => new Date() }
  const { input, sessions } = await api.finalizationFixture(db, runtime)
  const context = { householdId: input.householdId }
  const legacy = { token: 'a'.repeat(64), person: null, authMethod: 'password', expiresAt: '2099-01-01' }
  await api.createSession(db, runtime, context, legacy)
  const records = ['incomes', 'expenses', 'carryovers', 'passkey_credentials', 'payment_operations', 'payment_records', 'payment_voids']
  const snapshot = () => Promise.all(records.map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results))
  const before = await snapshot()
  assert.ok(before[3].length > 0 && before[4].length > 0)
  const adminDb = createWranglerDatabase({ database_id: 'fixture' }, 'dev', temp, async args => {
    const sql = await readFile(args[args.indexOf('--file') + 1], 'utf8')
    const result = await db.prepare(sql).all()
    return [{ success: result.success, results: result.results }]
  })
  const options = { command: 'review-finalize', environment: 'dev', databaseId: 'fixture' }
  await assert.rejects(api.finalizeLegacyAuthentication(db, runtime, { ...input, members: input.members.slice(0, 1) }))
  const review = await executeFinalizationCommand(adminDb, api, options, input)
  assert.equal((await db.prepare('SELECT legacy_auth_disabled_at t FROM households WHERE id=?').bind(input.householdId).first()).t, null)
  await db.exec('CREATE TRIGGER ignore_finalization BEFORE UPDATE OF legacy_auth_disabled_at ON households BEGIN SELECT RAISE(IGNORE); END')
  await assert.rejects(executeFinalizationCommand(adminDb, api, { ...options, command: 'finalize' }, review))
  assert.ok(await api.getSession(db, legacy.token))
  await db.exec('DROP TRIGGER ignore_finalization')
  const result = await executeFinalizationCommand(adminDb, api, { ...options, command: 'finalize' }, review)
  assert.equal(result.kind, 'finalized')
  assert.equal((await executeFinalizationCommand(adminDb, api, { ...options, command: 'finalize' }, review)).kind, 'already_finalized')
  assert.equal(await api.getSession(db, legacy.token), null)
  await assert.rejects(api.createSession(db, runtime, context, { ...legacy, token: 'b'.repeat(64) }))
  for (const [index, session] of sessions.entries()) {
    assert.equal((await api.getSession(db, session.token)).userId, session.userId)
    const attemptInput = { state: crypto.randomUUID() + '-padding', nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43), browserBinding: 'b'.repeat(64) }
    const attempt = await api.createOAuthAttempt(db, runtime, attemptInput)
    const claim = await api.claimOAuthAttempt(db, runtime, { ...attemptInput, attemptId: attempt.attemptId })
    const fresh = await api.completeGoogleLogin(db, runtime, claim, { issuer: 'https://accounts.google.com', subject: `finalize-${index}`, email: `finalize-${index}@example.invalid` })
    assert.equal(fresh.kind, 'authenticated')
    assert.equal(fresh.session.userId, session.userId)
  }
  for (const [path, method, body] of [['passkeys', 'GET'], ['passkeys/credential', 'GET'], ['passkeys/credential', 'DELETE'],
    ['passkeys', 'POST', { id: 'new' }], ['webauthn-challenges', 'POST', { challenge: 'new', person: 'husband', expiresAt: '2099-01-01' }],
    ['webauthn-challenges/register/consume', 'POST', { person: 'husband' }]]) {
    const url = new URL(`https://fixture/${path}`)
    const request = new Request(url, { method, headers: { 'x-household-session': sessions[0].token, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    await assert.rejects(api.routeAuthManagement({ request, url, parts: path.split('/'), env: { DB: db }, runtime }), error => error.status === 401)
  }
  assert.equal(await api.findAuthenticationCredential(db, 'credential'), null)
  await assert.rejects(api.createChallenge(db, runtime, { type: 'authentication' }, { challenge: 'new', person: null, expiresAt: '2099-01-01' }))
  await assert.rejects(api.consumeChallenge(db, runtime, { type: 'authentication' }, 'authenticate', null))
  assert.deepEqual(await snapshot(), before)
  await api.revokeGoogleSessions(db, runtime, sessions[0].token)
  assert.equal(await api.getSession(db, sessions[0].token), null)
  assert.ok(await api.getSession(db, sessions[1].token))
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  console.log('旧認証終了D1検証成功: 確認不足拒否・CLI review/明示停止・UPDATE0件拒否・原子旧session失効・Google継続/partner保持・旧直接管理拒否・全資格情報/履歴保持')
} finally { await mf.dispose(); await rm(temp, { recursive: true, force: true }) }
