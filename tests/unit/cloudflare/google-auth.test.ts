import { webcrypto } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createIdentitySqlite } from '../../helpers/identity-sqlite'
import { createRuntime } from '../../../cloudflare/worker/src/d1'
import { createOAuthAttempt, claimOAuthAttempt, failOAuthAttempt, expireOAuthAttempts } from '../../../cloudflare/worker/src/oauth-attempts'

beforeAll(() => vi.stubGlobal('crypto', webcrypto))
afterAll(() => vi.unstubAllGlobals())
let store: ReturnType<typeof createIdentitySqlite>
let runtime: ReturnType<typeof createRuntime>
beforeEach(() => { store = createIdentitySqlite({ fixture: false }); runtime = createRuntime() })
afterEach(() => store.sqlite.close())
const input = () => ({ state: crypto.randomUUID() + 'state-padding', nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43), browserBinding: 'b'.repeat(64) })

async function begin() {
  const values = input()
  const attempt = await createOAuthAttempt(store.db, runtime, values)
  return { ...attempt, values }
}

it('stateとブラウザをhash保存し、同じ試行のclaimは一度だけ取得できる', async () => {
  const attempt = await begin()
  const credentials = { attemptId: attempt.attemptId, state: attempt.values.state, browserBinding: attempt.values.browserBinding }
  const claimed = await claimOAuthAttempt(store.db, runtime, credentials)
  expect(claimed).toMatchObject({ attemptId: attempt.attemptId, nonce: attempt.values.nonce, codeVerifier: attempt.values.codeVerifier })
  await expect(claimOAuthAttempt(store.db, runtime, credentials)).rejects.toMatchObject({ code: 'attempt_invalid' })
  const stored = store.sqlite.prepare('SELECT * FROM oauth_login_attempts').get()!
  expect(stored.state_hash).not.toBe(attempt.values.state)
  expect(stored.browser_binding_hash).not.toBe(attempt.values.browserBinding)
  expect(String(stored.state_hash)).toMatch(/^[a-f0-9]{64}$/)
})

import { completeGoogleLogin } from '../../../cloudflare/worker/src/google-login'
import { approveGoogleMigration, getGoogleMigrationRequest, expireGoogleMigrationRequests } from '../../../cloudflare/worker/src/google-migrations'
import { legacyHouseholdId } from '../../helpers/identity-sqlite'
const identity = { issuer: 'https://accounts.google.com' as const, subject: 'subject-a', email: 'a@example.com' }
async function claimed() {
  const attempt = await begin()
  return claimOAuthAttempt(store.db, runtime, { attemptId: attempt.attemptId, state: attempt.values.state, browserBinding: attempt.values.browserBinding })
}

it('未知主体は家計を作らずブラウザ専用の移行申請だけを返す', async () => {
  const result = await completeGoogleLogin(store.db, runtime, await claimed(), identity)
  expect(result.kind).toBe('migration_pending')
  if (result.kind !== 'migration_pending') throw new Error('申請が必要')
  expect(await getGoogleMigrationRequest(store.db, runtime, result.requestId, result.browserSecret)).toMatchObject({ status: 'pending', email: identity.email })
  expect(await getGoogleMigrationRequest(store.db, runtime, result.requestId, 'x'.repeat(64))).toBeNull()
  for (const table of ['users', 'household_memberships', 'sessions']) {
    expect(store.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n).toBe(0)
  }
  expect(store.sqlite.prepare('SELECT nonce,code_verifier FROM oauth_login_attempts').get()).toMatchObject({ nonce: null, code_verifier: null })
})

it('完了済みの同じclaimから申請を再作成できない', async () => {
  const claim = await claimed()
  await completeGoogleLogin(store.db, runtime, claim, identity)
  await expect(completeGoogleLogin(store.db, runtime, claim, identity)).rejects.toMatchObject({ code: 'operation_failed' })
  expect(store.sqlite.prepare('SELECT COUNT(*) n FROM google_migration_requests').get()?.n).toBe(1)
})

async function pending(subject = identity.subject) {
  const result = await completeGoogleLogin(store.db, runtime, await claimed(), { ...identity, subject })
  if (result.kind !== 'migration_pending') throw new Error('申請が必要')
  return result
}
const approval = (request: { requestId: string; code: string }, slot = 'existing-member-1' as const) => ({
  requestId: request.requestId, code: request.code, approvedBy: 'operator-fixture', confirmationRef: 'trusted-check-fixture',
  householdId: legacyHouseholdId, legacySlot: slot, defaultPerson: 'husband' as const,
})
it('コードを照合したpendingだけを既存世帯の移行枠へ承認する', async () => {
  const request = await pending()
  await expect(approveGoogleMigration(store.db, runtime, { ...approval(request), code: 'x'.repeat(64) })).rejects.toMatchObject({ code: 'approval_invalid' })
  await expect(approveGoogleMigration(store.db, runtime, approval(request))).resolves.toEqual({ requestId: request.requestId })
  expect(await getGoogleMigrationRequest(store.db, runtime, request.requestId, request.browserSecret)).toMatchObject({ status: 'approved' })
})

it('承認済み主体の再ログインでuser/所属/sessionを原子的に作る', async () => {
  const request = await pending()
  await approveGoogleMigration(store.db, runtime, approval(request))
  const result = await completeGoogleLogin(store.db, runtime, await claimed(), identity)
  expect(result.kind).toBe('authenticated')
  if (result.kind !== 'authenticated') throw new Error('認証が必要')
  expect(result.session).toMatchObject({ authMethod: 'google', householdId: legacyHouseholdId, sessionEpoch: 0 })
  expect(result.session.token).toMatch(/^[a-f0-9]{64}$/)
  expect(store.sqlite.prepare('SELECT status,consumed_user_id FROM google_migration_requests').get())
    .toMatchObject({ status: 'consumed', consumed_user_id: result.session.userId })
})

async function enrolled(subject = identity.subject, slot: 'existing-member-1' | 'existing-member-2' = 'existing-member-1') {
  const request = await pending(subject)
  await approveGoogleMigration(store.db, runtime, { ...approval(request), legacySlot: slot })
  const result = await completeGoogleLogin(store.db, runtime, await claimed(), { ...identity, subject })
  if (result.kind !== 'authenticated') throw new Error('認証が必要')
  return result.session
}
it('再ログインと応答消失後の再試行でも同じuserと所属を継続する', async () => {
  const first = await enrolled()
  const result = await completeGoogleLogin(store.db, runtime, await claimed(), identity)
  expect(result).toMatchObject({ kind: 'authenticated', session: { userId: first.userId, membershipId: first.membershipId } })
  expect(store.sqlite.prepare('SELECT COUNT(*) n FROM users').get()?.n).toBe(1)
})
it('事前解決の後に2つ目の所属が追加されたら最終INSERTで拒否する', async () => {
  const first = await enrolled()
  const claim = await claimed()
  const db = { ...store.db, batch: async (statements: Parameters<typeof store.db.batch>[0]) => {
    store.sqlite.prepare('INSERT INTO households(id,created_at) VALUES(?,?)').run('other-household', runtime.now().toISOString())
    store.sqlite.prepare('INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES(?,?,?,?,?)')
      .run('other-membership', first.userId, 'other-household', 'wife', runtime.now().toISOString())
    return store.db.batch(statements)
  } }
  await expect(completeGoogleLogin(db, runtime, claim, identity)).rejects.toMatchObject({ code: 'operation_failed' })
  expect(store.sqlite.prepare('SELECT status FROM oauth_login_attempts WHERE id=?').get(claim.attemptId)?.status).toBe('processing')
  expect(store.sqlite.prepare('SELECT COUNT(*) n FROM sessions').get()?.n).toBe(1)
})

import { getSession } from '../../../cloudflare/worker/src/sessions'
import { revokeGoogleSessions, deactivateGoogleUser } from '../../../cloudflare/worker/src/google-revocation'
it('本人全端末失効は本人の古いCookie/試行だけを拒否しpartnerを保持する', async () => {
  const a = await enrolled()
  const b = await enrolled('subject-b', 'existing-member-2')
  const oldClaim = await claimed()
  expect(await getSession(store.db, a.token)).toMatchObject({ userId: a.userId, authMethod: 'google' })
  await revokeGoogleSessions(store.db, runtime, a.token)
  expect(await getSession(store.db, a.token)).toBeNull()
  expect(await getSession(store.db, b.token)).toMatchObject({ userId: b.userId })
  await expect(completeGoogleLogin(store.db, runtime, oldClaim, identity)).rejects.toMatchObject({ code: 'operation_failed' })
  await expect(completeGoogleLogin(store.db, runtime, await claimed(), identity)).resolves.toMatchObject({ kind: 'authenticated', session: { sessionEpoch: 1 } })
  await expect(revokeGoogleSessions(store.db, runtime, a.token)).rejects.toMatchObject({ code: 'session_invalid' })
})

import { approveGoogleRecovery } from '../../../cloudflare/worker/src/google-migrations'
it('復旧承認が新epochでも失効前の試行を拒否し、新試行だけ同じuserへ復旧する', async () => {
  const a = await enrolled()
  const recovery = await pending('replacement-subject')
  const oldClaim = await claimed()
  const oldIdentity = store.sqlite.prepare('SELECT id FROM google_identities WHERE user_id=?').get(a.userId)!
  await revokeGoogleSessions(store.db, runtime, a.token)
  await approveGoogleRecovery(store.db, runtime, { requestId: recovery.requestId, code: recovery.code,
    approvedBy: 'operator', confirmationRef: 'checked', targetUserId: a.userId,
    expectedOldIdentityId: String(oldIdentity.id), expectedEpoch: 1 })
  await expect(completeGoogleLogin(store.db, runtime, oldClaim, { ...identity, subject: 'replacement-subject' }))
    .rejects.toMatchObject({ code: 'operation_failed' })
  expect(store.sqlite.prepare('SELECT status FROM google_migration_requests WHERE id=?').get(recovery.requestId)?.status).toBe('approved')
  const result = await completeGoogleLogin(store.db, runtime, await claimed(), { ...identity, subject: 'replacement-subject' })
  expect(result).toEqual({ kind: 'recovered', userId: a.userId })
  expect(store.sqlite.prepare('SELECT COUNT(*) n FROM users').get()?.n).toBe(1)
  expect(store.sqlite.prepare('SELECT COUNT(*) n FROM household_memberships').get()?.n).toBe(1)
  await expect(completeGoogleLogin(store.db, runtime, await claimed(), identity)).rejects.toMatchObject({ code: 'identity_denied' })
  await expect(completeGoogleLogin(store.db, runtime, await claimed(), { ...identity, subject: 'replacement-subject' }))
    .resolves.toMatchObject({ kind: 'authenticated', session: { userId: a.userId, sessionEpoch: 2 } })
})

it('承認期限が切れた枠を清掃して新しいpendingを承認できる', async () => {
  const old = await pending()
  await approveGoogleMigration(store.db, runtime, approval(old))
  runtime = createRuntime({ now: () => new Date(Date.now() + 11 * 60_000) })
  const next = await pending('subject-b')
  await approveGoogleMigration(store.db, runtime, approval(next))
  expect(store.sqlite.prepare('SELECT status FROM google_migration_requests WHERE id=?').get(old.requestId)?.status).toBe('expired')
  expect(store.sqlite.prepare('SELECT status FROM google_migration_requests WHERE id=?').get(next.requestId)?.status).toBe('approved')
})
it('移行batch途中で失敗するとuser/主体/所属も許可消費も保存しない', async () => {
  const request = await pending()
  await approveGoogleMigration(store.db, runtime, approval(request))
  const claim = await claimed()
  store.sqlite.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON household_memberships BEGIN SELECT RAISE(ABORT,'fixture-secret'); END")
  const error = await completeGoogleLogin(store.db, runtime, claim, identity).catch(error => error)
  expect(error.code).toBe('operation_failed')
  expect(error.cause).toBeUndefined()
  expect(String(error)).not.toContain('fixture-secret')
  expect(store.sqlite.prepare('SELECT status FROM oauth_login_attempts WHERE id=?').get(claim.attemptId)?.status).toBe('processing')
  expect(store.sqlite.prepare('SELECT status FROM google_migration_requests WHERE id=?').get(request.requestId)?.status).toBe('approved')
  for (const table of ['users', 'google_identities', 'household_memberships', 'sessions']) expect(store.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n).toBe(0)
})
it('所属解除後に再所属しても古いsessionと試行は復活しない', async () => {
  const a = await enrolled()
  const oldClaim = await claimed()
  store.sqlite.prepare('UPDATE household_memberships SET revoked_at=? WHERE id=?').run(runtime.now().toISOString(), a.membershipId)
  store.sqlite.prepare('INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES(?,?,?,?,?)')
    .run('new-membership', a.userId, a.householdId, 'wife', runtime.now().toISOString())
  expect(await getSession(store.db, a.token)).toBeNull()
  await expect(completeGoogleLogin(store.db, runtime, oldClaim, identity)).rejects.toMatchObject({ code: 'operation_failed' })
  await expect(completeGoogleLogin(store.db, runtime, await claimed(), identity)).resolves.toMatchObject({ kind: 'authenticated', session: { membershipId: 'new-membership', userId: a.userId, person: 'wife' } })
})
it('停止したuserはsessionも通常ログインも使えない', async () => {
  const a = await enrolled()
  await expect(deactivateGoogleUser(store.db, runtime, { userId: a.userId, expectedEpoch: 1 })).rejects.toMatchObject({ code: 'session_invalid' })
  await deactivateGoogleUser(store.db, runtime, { userId: a.userId, expectedEpoch: 0 })
  expect(await getSession(store.db, a.token)).toBeNull()
  await expect(completeGoogleLogin(store.db, runtime, await claimed(), identity)).rejects.toMatchObject({ code: 'identity_denied' })
})
it('別ブラウザ/state/期限切れではclaimできず期限清掃で秘密値を消す', async () => {
  const attempt = await begin()
  const correct = { attemptId: attempt.attemptId, state: attempt.values.state, browserBinding: attempt.values.browserBinding }
  for (const override of [{ state: 'x'.repeat(64) }, { browserBinding: 'x'.repeat(64) }]) {
    await expect(claimOAuthAttempt(store.db, runtime, { ...correct, ...override })).rejects.toMatchObject({ code: 'attempt_invalid' })
  }
  const future = createRuntime({ now: () => new Date(Date.now() + 11 * 60_000) })
  await expect(claimOAuthAttempt(store.db, future, correct)).rejects.toMatchObject({ code: 'attempt_invalid' })
  await expireOAuthAttempts(store.db, future)
  expect(store.sqlite.prepare('SELECT status,nonce,code_verifier FROM oauth_login_attempts WHERE id=?').get(attempt.attemptId))
    .toMatchObject({ status: 'expired', nonce: null, code_verifier: null })
})
it('失敗したclaimの秘密値を消去し再利用を拒否する', async () => {
  const claim = await claimed()
  await failOAuthAttempt(store.db, runtime, claim)
  expect(store.sqlite.prepare('SELECT status,nonce,code_verifier FROM oauth_login_attempts WHERE id=?').get(claim.attemptId))
    .toMatchObject({ status: 'failed', nonce: null, code_verifier: null })
  await expect(completeGoogleLogin(store.db, runtime, claim, identity)).rejects.toMatchObject({ code: 'operation_failed' })
})
it('同時claimは1処理だけが取得する', async () => {
  const attempt = await begin()
  const credentials = { attemptId: attempt.attemptId, state: attempt.values.state, browserBinding: attempt.values.browserBinding }
  const results = await Promise.allSettled([claimOAuthAttempt(store.db, runtime, credentials), claimOAuthAttempt(store.db, runtime, credentials)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
})
it('別ブラウザから同じ未知主体で申請できるが承認の同時消費は1回だけ', async () => {
  const first = await pending()
  const second = await pending()
  expect(first.requestId).not.toBe(second.requestId)
  await approveGoogleMigration(store.db, runtime, approval(first))
  const [a, b] = await Promise.all([claimed(), claimed()])
  const results = await Promise.allSettled([completeGoogleLogin(store.db, runtime, a, identity), completeGoogleLogin(store.db, runtime, b, identity)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(store.sqlite.prepare('SELECT COUNT(*) n FROM users').get()?.n).toBe(1)
})

import { recordPayment, getPaymentStatus } from '../../../cloudflare/worker/src/payment-status'
import { createSession as createLegacySession } from '../../../cloudflare/worker/src/sessions'
import { getLegacyHouseholdContext } from '../../../cloudflare/worker/src/households'
it('Googleの支払履歴に検証済み本人を保存し失効後も履歴を保持する', async () => {
  const a = await enrolled()
  const actor = await getSession(store.db, a.token)
  if (!actor) throw new Error('認証が必要')
  store.sqlite.prepare("INSERT INTO incomes(id,household_id,month,label,amount,person,created_at,updated_at) VALUES('income',?,'202609','給与',10000,'husband',?,?)")
    .run(a.householdId, runtime.now().toISOString(), runtime.now().toISOString())
  const before = await getPaymentStatus(store.db, actor, '202609')
  await recordPayment(store.db, runtime, actor, { month: '202609', operationId: crypto.randomUUID(), expectedRevision: before.revision,
    confirmedSignedYen: before.remainingSignedYen, paidOn: runtime.now().toISOString().slice(0, 10) })
  await revokeGoogleSessions(store.db, runtime, a.token)
  const after = await getPaymentStatus(store.db, { householdId: a.householdId }, '202609')
  expect(after.payments[0].actor).toEqual({ person: 'husband', authMethod: 'google', userId: a.userId })
  expect(store.sqlite.prepare('SELECT actor_user_id FROM payment_operations').get()?.actor_user_id).toBe(a.userId)
})
it('legacy停止後も非認証の世帯解決は保持し、旧session発行だけを拒否する', async () => {
  const context = await getLegacyHouseholdContext(store.db)
  const input = { token: 'd'.repeat(64), person: null, authMethod: 'password', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }
  await createLegacySession(store.db, runtime, context, input)
  expect(await getSession(store.db, input.token)).toMatchObject({ authMethod: 'password' })
  store.sqlite.prepare('UPDATE households SET legacy_auth_disabled_at=? WHERE id=?').run(runtime.now().toISOString(), context.householdId)
  expect(await getLegacyHouseholdContext(store.db)).toEqual(context)
  expect(await getSession(store.db, input.token)).toBeNull()
  await expect(createLegacySession(store.db, runtime, context, input)).rejects.toMatchObject({ status: 401 })
})

it('申請読取も承認期限を確認し、清掃しても消費済み履歴は保持する', async () => {
  const a = await enrolled()
  const request = await pending('subject-b')
  await approveGoogleMigration(store.db, runtime, { ...approval(request), legacySlot: 'existing-member-2' })
  const future = createRuntime({ now: () => new Date(Date.now() + 11 * 60_000) })
  expect(await getGoogleMigrationRequest(store.db, future, request.requestId, request.browserSecret)).toBeNull()
  await expireGoogleMigrationRequests(store.db, future)
  expect(store.sqlite.prepare("SELECT status FROM google_migration_requests WHERE consumed_user_id=?").get(a.userId)?.status).toBe('consumed')
})
it('不正な検証済み主体形式と対象が変わった復旧承認を固定エラーで拒否する', async () => {
  const claim = await claimed()
  await expect(completeGoogleLogin(store.db, runtime, claim, { ...identity, issuer: 'https://untrusted.example' } as unknown as typeof identity)).rejects.toMatchObject({ code: 'invalid_input' })
  const a = await enrolled()
  const request = await pending('replacement')
  await expect(approveGoogleRecovery(store.db, runtime, { requestId: request.requestId, code: request.code, approvedBy: 'operator',
    confirmationRef: 'checked', targetUserId: a.userId, expectedEpoch: 0, expectedOldIdentityId: 'wrong-old-identity' }))
    .rejects.toMatchObject({ code: 'approval_invalid' })
})
