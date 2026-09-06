import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Miniflare } from 'miniflare'

// Wranglerと同じ隔離stateを開き、復元したDBへ実共有関数を直接接続する。
export async function verifyHouseholdFunctions(temp, state, restored = false) {
  const output = join(temp, 'shared-functions.mjs')
  await build({ stdin: { contents: ['records', 'copy-month', 'sessions', 'passkeys', 'challenges', 'ai-diagnosis-store', 'payment-status'].map(name => `export * from './cloudflare/worker/src/${name}.ts'`).join(';'), resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: output })
  const api = await import(pathToFileURL(output).href)
  const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-07-08', d1Databases: { DB: '00000000-0000-0000-0000-000000000001' }, d1Persist: join(state, 'v3/d1') })
  try {
    const db = await mf.getD1Database('DB')
    const a = { householdId: (await db.prepare("SELECT id FROM households WHERE legacy_auth_key='legacy'").first()).id, person: null, authMethod: 'password' }
    const b = { householdId: 'B', person: 'wife', authMethod: 'passkey' }
    const runtime = { now: () => new Date('2026-09-05T00:00:00Z'), randomUUID: () => crypto.randomUUID() }
    // 0012失敗後も0011の既存session/明細/認証/AI/operationを実関数が読める。
    assert.equal((await api.getSession(db, '1'.padStart(64, '0'), runtime.now())).householdId, a.householdId)
    assert.equal((await api.getPasskey(db, a, 'credential')).counter, 17)
    assert.equal((await api.listRecordsByMonth(db, a, 'income', '202609'))[0].id, 'income')
    assert.equal((await api.getDiagnosisContext(db, a, '202609')).incomes[0].amount, 310001)
    assert.ok(await api.getSavedDiagnosis(db, a, '202609'))
    assert.ok(await api.getPaymentOperation(db, a, '202609', 'record'))
    if (!restored) return
    // 別世帯fixtureもexportに含まれる。復元後に作り直して成功扱いにしない。
    assert.ok(await db.prepare("SELECT id FROM households WHERE id='B'").first())
    const snapshot = async () => Promise.all(['incomes', 'expenses', 'carryovers', 'passkey_credentials', 'webauthn_challenges', 'ai_diagnoses', 'ai_execution_guard', 'ai_diagnosis_source_revision', 'month_payment_revisions', 'payment_operations', 'payment_records', 'payment_voids'].map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results))
    const beforeForeign = await snapshot()
    assert.equal(await api.getPasskey(db, b, 'credential'), null)
    assert.deepEqual(await api.listPasskeys(db, b), [])
    assert.equal((await api.findAuthenticationCredential(db, 'credential')).householdId, a.householdId)
    await assert.rejects(api.updatePasskeyCounter(db, b, 'credential', { counter: 18 }), e => e.status === 409)
    await api.deletePasskey(db, b, 'credential')
    assert.equal((await api.getPasskey(db, a, 'credential')).counter, 17)
    assert.equal(await api.consumeChallenge(db, runtime, { type: 'registration', context: b }, 'register', 'wife'), null)
    assert.equal(await api.getPaymentOperation(db, b, '202609', 'record'), null)
    assert.equal(await api.getSavedDiagnosis(db, b, '202609'), null)
    for (const type of ['income', 'expense', 'carryover']) {
      const id = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'carryover'
      await assert.rejects(api.updateRecord(db, runtime, b, type, id, { label: '越境', amount: type === 'income' ? 1 : -1, person: 'wife' }), e => e.status === 404)
      await assert.rejects(api.deleteRecord(db, b, type, id), e => e.status === 404)
      if (type !== 'income') await assert.rejects(api.patchRecordFlag(db, runtime, b, type, id, { isCarryover: true, isCleared: true }), e => e.status === 404)
    }
    const preview = await api.getCopyMonthPreview(db, b, '202609', '202611')
    assert.ok(preview.items.every(item => item.id !== 'income' && item.id !== 'expense'))
    await assert.rejects(api.copyMonthData(db, runtime, b, { sourceMonth: '202609', targetMonth: '202611', mode: 'replace', includeCarryover: false, carryoverFingerprint: preview.carryoverFingerprint, selectedItems: [{ id: 'income', label: '給与 -- 月額', amount: 310001, person: 'husband', type: 'income', itemCopyMode: 'withAmount' }] }), e => e.status === 404)
    assert.deepEqual(await snapshot(), beforeForeign)
    assert.ok((await api.listMonthlyAmounts(db, b)).incomes.length > 0)
    const token = 'f'.repeat(64)
    await api.createSession(db, runtime, a, { token, person: null, authMethod: 'password', expiresAt: '2026-10-01' })
    assert.equal((await api.getSession(db, token, runtime.now())).householdId, a.householdId)
    await api.deleteSession(db, token)
    assert.equal(await api.getSession(db, token, runtime.now()), null)
    await api.createPasskey(db, runtime, b, { id: 'restored-credential', person: 'wife', publicKeyBase64: 'a2V5', counter: 0, transports: ['internal'] })
    await api.updatePasskeyCounter(db, b, 'restored-credential', { counter: 1 })
    assert.equal((await api.getPasskey(db, b, 'restored-credential')).counter, 1)
    await api.deletePasskey(db, b, 'restored-credential')
    const registration = { type: 'registration', context: b }
    const challenge = await api.createChallenge(db, runtime, registration, { challenge: 'restored', person: 'wife', expiresAt: '2026-10-01' })
    assert.equal(await api.consumeChallenge(db, runtime, { type: 'registration', context: a }, challenge.id, 'wife'), null)
    assert.equal((await api.consumeChallenge(db, runtime, registration, challenge.id, 'wife')).householdId, 'B')
    const authentication = await api.createChallenge(db, runtime, { type: 'authentication' }, { challenge: 'restored-login', person: null, expiresAt: '2026-10-01' })
    assert.equal((await api.consumeChallenge(db, runtime, { type: 'authentication' }, authentication.id, null)).householdId, null)
    await api.deleteExpiredChallenges(db, '2026-01-01')
    const aBefore = await api.getDiagnosisContext(db, a, '202609')
    assert.equal((await api.acquireDiagnosisLease(db, runtime, b, '202609', 'restored-lease')).acquired, true)
    await assert.rejects(api.saveExpenseCategories(db, runtime, b, '202609', 'restored-lease', [{ expenseIds: ['expense'], category: 'groceries', expectedLabel: '食費' }]))
    const bContext = await api.getDiagnosisContext(db, b, '202609')
    await api.saveDiagnosis(db, runtime, b, '202609', { runToken: 'restored-lease', inputHash: 'restored', analysisVersion: 'v1', diagnosis: { household: 'B' }, expectedSourceRevision: bContext.sourceRevision })
    assert.deepEqual(await api.getDiagnosisContext(db, a, '202609'), aBefore)
    const later = { ...runtime, now: () => new Date('2026-09-06T00:00:00Z') }
    assert.equal((await api.acquireDiagnosisLease(db, later, b, '202608', 'release-test')).acquired, true)
    await api.releaseDiagnosisLease(db, b, '202608', 'release-test')
    // 同じ操作番号を両世帯で記録・再送し、他世帯の振込取消を拒否する。
    for (const context of [a, b]) {
      await api.createRecord(db, runtime, context, 'income', { month: '202612', label: '給与', amount: 1000, person: 'husband' })
    }
    const operationId = crypto.randomUUID()
    const payments = []
    for (const context of [a, b]) {
      const status = await api.getPaymentStatus(db, context, '202612')
      const input = { month: '202612', operationId, expectedRevision: status.revision, confirmedSignedYen: status.remainingSignedYen, paidOn: '2026-09-05' }
      const payment = await api.recordPayment(db, runtime, context, input)
      assert.deepEqual(await api.recordPayment(db, runtime, context, input), payment)
      payments.push(payment)
    }
    assert.notEqual(payments[0].paymentId, payments[1].paymentId)
    const status = await api.getPaymentStatus(db, b, '202612')
    await assert.rejects(api.correctPayment(db, runtime, b, { month: '202612', operationId: crypto.randomUUID(), expectedRevision: status.revision, paymentId: payments[0].paymentId, reason: '越境', replacement: null }), e => e.status === 404)
    await api.correctPayment(db, runtime, b, { month: '202612', operationId: crypto.randomUUID(), expectedRevision: status.revision, paymentId: payments[1].paymentId, reason: '自身の取消', replacement: null })
    assert.equal((await api.getPaymentStatus(db, a, '202612')).payments[0].id, payments[0].paymentId)
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  } finally { await mf.dispose() }
}
