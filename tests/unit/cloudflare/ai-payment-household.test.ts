import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHouseholdDataSqlite, householdA as a, householdB as b } from '../../helpers/household-data-sqlite'
import * as ai from '../../../cloudflare/worker/src/ai-diagnosis-store'
import * as payment from '../../../cloudflare/worker/src/payment-status'
const runtime = { now: () => new Date('2026-09-05T00:00:00Z'), randomUUID: () => crypto.randomUUID() }
const actorA = { ...a, person: null, authMethod: 'password' as const }
const actorB = { ...b, person: null, authMethod: 'password' as const }
describe('AIと振込の世帯境界（全migration実SQL）', () => {
  let fixture: ReturnType<typeof createHouseholdDataSqlite>
  beforeEach(() => { fixture = createHouseholdDataSqlite() })
  afterEach(() => fixture?.sqlite.close())
  function income(householdId: string, id: string) {
    fixture.sqlite.prepare("INSERT INTO incomes(id,household_id,month,label,amount,person,created_at,updated_at) VALUES(?,?,'202609','収入',100,'husband','now','now')").run(id, householdId)
  }
  it('同月のcontext/revision/lease/保存結果は独立する', async () => {
    income(a.householdId, 'a')
    const initial = await ai.getDiagnosisContext(fixture.db, a, '202609')
    income(b.householdId, 'b')
    expect(await ai.getDiagnosisContext(fixture.db, a, '202609')).toEqual(initial)
    expect(initial.incomes).toHaveLength(1)
    await expect(ai.acquireDiagnosisLease(fixture.db, runtime, a, '202609', 'same')).resolves.toEqual({ acquired: true })
    await expect(ai.acquireDiagnosisLease(fixture.db, runtime, b, '202609', 'same')).resolves.toEqual({ acquired: true })
    await ai.saveDiagnosis(fixture.db, runtime, a, '202609', { runToken: 'same', inputHash: 'hash', analysisVersion: 'v1', diagnosis: { a: true }, expectedSourceRevision: initial.sourceRevision })
    expect(await ai.getSavedDiagnosis(fixture.db, b, '202609')).toBeNull()
    expect(fixture.sqlite.prepare('SELECT run_token FROM ai_execution_guard WHERE household_id=?').get(b.householdId)?.run_token).toBe('same')
  })
  it('同operation IDの再送とsnapshotを世帯ごとに分離する', async () => {
    income(a.householdId, 'a'); income(b.householdId, 'b')
    const operationId = crypto.randomUUID()
    const input = { month: '202609', operationId, expectedRevision: 1, confirmedSignedYen: 50, paidOn: '2026-09-05' }
    const ra = await payment.recordPayment(fixture.db, runtime, actorA, input)
    const rb = await payment.recordPayment(fixture.db, runtime, actorB, input)
    expect(ra.paymentId).not.toBe(rb.paymentId)
    expect(await payment.recordPayment(fixture.db, runtime, actorA, input)).toEqual(ra)
    const status = await payment.getPaymentStatus(fixture.db, a, '202609')
    expect(JSON.stringify(status)).not.toContain('"id":"b"')
    await expect(payment.correctPayment(fixture.db, runtime, actorB, { month: '202609', operationId: crypto.randomUUID(), expectedRevision: 2, paymentId: ra.paymentId, reason: '取消', replacement: null })).rejects.toMatchObject({ status: 404 })
  })
  function expense(householdId: string, id: string) {
    fixture.sqlite.prepare("INSERT INTO expenses(id,household_id,month,label,amount,person,created_at,updated_at) VALUES(?,?,'202609','食費',-100,'wife','now','now')").run(id, householdId)
  }
  it('自世帯変更はstale、別世帯変更はstaleにせず、古いtokenは現在leaseを解放しない', async () => {
    const revision = (await ai.getDiagnosisContext(fixture.db, a, '202609')).sourceRevision
    await ai.acquireDiagnosisLease(fixture.db, runtime, a, '202609', 'old')
    income(a.householdId, 'edit')
    await expect(ai.saveDiagnosis(fixture.db, runtime, a, '202609', { runToken: 'old', inputHash: 'hash', analysisVersion: 'v1', diagnosis: {}, expectedSourceRevision: revision })).rejects.toThrow(ai.SOURCE_REVISION_CONFLICT_MESSAGE)
    const later = { ...runtime, now: () => new Date('2026-09-05T00:04:00Z') }
    await ai.acquireDiagnosisLease(fixture.db, later, a, '202609', 'new')
    await expect(ai.releaseDiagnosisLease(fixture.db, a, '202609', 'old')).rejects.toThrow('失効')
    expect(fixture.sqlite.prepare('SELECT run_token FROM ai_execution_guard WHERE household_id=?').get(a.householdId)?.run_token).toBe('new')
    await expect(ai.releaseDiagnosisLease(fixture.db, b, '202609', 'new')).rejects.toThrow('失効')
    expect(fixture.sqlite.prepare('SELECT run_token FROM ai_execution_guard WHERE household_id=?').get(a.householdId)?.run_token).toBe('new')
  })
  it('guard/cooldown/UTC日次回数は世帯内で月を跨いで共有する', async () => {
    await ai.acquireDiagnosisLease(fixture.db, runtime, a, '202609', 'a')
    await expect(ai.acquireDiagnosisLease(fixture.db, runtime, a, '202608', 'a2')).resolves.toMatchObject({ acquired: false, reason: 'busy' })
    await ai.releaseDiagnosisLease(fixture.db, a, '202609', 'a')
    await expect(ai.acquireDiagnosisLease(fixture.db, runtime, a, '202608', 'a2')).resolves.toMatchObject({ acquired: false, reason: 'cooldown' })
    fixture.sqlite.prepare("UPDATE ai_execution_guard SET daily_count=20,last_started_at=NULL WHERE household_id=?").run(a.householdId)
    await expect(ai.acquireDiagnosisLease(fixture.db, runtime, a, '202608', 'a2')).resolves.toMatchObject({ acquired: false, reason: 'daily_limit' })
    await expect(ai.acquireDiagnosisLease(fixture.db, runtime, b, '202609', 'b')).resolves.toEqual({ acquired: true })
    const tomorrow = { ...runtime, now: () => new Date('2026-09-06T00:00:00Z') }
    await expect(ai.acquireDiagnosisLease(fixture.db, tomorrow, a, '202608', 'tomorrow')).resolves.toEqual({ acquired: true })
    expect(fixture.sqlite.prepare('SELECT daily_count FROM ai_execution_guard WHERE household_id=?').get(a.householdId)?.daily_count).toBe(1)
  })
  it('他世帯expense ID混入時は自世帯を含む全分類を拒否し、正常分類はrevisionを動かさない', async () => {
    expense(a.householdId, 'ea'); expense(b.householdId, 'eb')
    await ai.acquireDiagnosisLease(fixture.db, runtime, a, '202609', 'a')
    const revision = (await ai.getDiagnosisContext(fixture.db, a, '202609')).sourceRevision
    await expect(ai.saveExpenseCategories(fixture.db, runtime, a, '202609', 'a', [{ expenseIds: ['ea','eb'], category: 'groceries', expectedLabel: '食費' }])).rejects.toThrow('分類中')
    expect(fixture.sqlite.prepare('SELECT ai_category FROM expenses WHERE id=?').get('ea')?.ai_category).toBeNull()
    await ai.saveExpenseCategories(fixture.db, runtime, a, '202609', 'a', [{ expenseIds: ['ea'], category: 'groceries', expectedLabel: '食費' }])
    expect((await ai.getDiagnosisContext(fixture.db, a, '202609')).sourceRevision).toBe(revision)
    expect(fixture.sqlite.prepare('SELECT ai_category FROM expenses WHERE id=?').get('eb')?.ai_category).toBeNull()
  })
  it('runtime context欠落は全公開store経路でDB操作前に拒否する', async () => {
    const missing = undefined as never
    await expect(ai.getDiagnosisContext(fixture.db, missing, '202609')).rejects.toMatchObject({ status: 401 })
    await expect(ai.acquireDiagnosisLease(fixture.db, runtime, missing, '202609', 't')).rejects.toMatchObject({ status: 401 })
    await expect(ai.saveExpenseCategories(fixture.db, runtime, missing, '202609', 't', [])).rejects.toMatchObject({ status: 401 })
    await expect(ai.getSavedDiagnosis(fixture.db, missing, '202609')).rejects.toMatchObject({ status: 401 })
    await expect(ai.releaseDiagnosisLease(fixture.db, missing, '202609', 't')).rejects.toMatchObject({ status: 401 })
    await expect(payment.getPaymentStatus(fixture.db, missing, '202609')).rejects.toMatchObject({ status: 401 })
    await expect(payment.recordPayment(fixture.db, runtime, missing, {})).rejects.toMatchObject({ status: 401 })
  })
  it('振込batchの後段失敗はoperation/payment/revisionをrollbackする', async () => {
    income(a.householdId, 'ia'); income(b.householdId, 'ib')
    const input = { month: '202609', operationId: crypto.randomUUID(), expectedRevision: 1, confirmedSignedYen: 50, paidOn: '2026-09-05' }
    const first = await payment.recordPayment(fixture.db, runtime, actorB, input)
    const beforeA = await payment.getPaymentStatus(fixture.db, a, '202609')
    const beforeB = await payment.getPaymentStatus(fixture.db, b, '202609')
    await expect(payment.recordPayment(fixture.db, { ...runtime, randomUUID: () => first.paymentId! }, actorA, input)).rejects.toMatchObject({ status: 500 })
    expect(await payment.getPaymentOperation(fixture.db, a, '202609', input.operationId)).toBeNull()
    expect(await payment.getPaymentStatus(fixture.db, a, '202609')).toEqual(beforeA)
    expect(await payment.getPaymentStatus(fixture.db, b, '202609')).toEqual(beforeB)
  })

})
