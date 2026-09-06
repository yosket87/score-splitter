import { afterEach, describe, expect, it, vi } from 'vitest'
import * as store from '../../../cloudflare/worker/src/payment-store'
import { recordPayment, correctPayment, getPaymentStatus, getPaymentOperation } from '../../../cloudflare/worker/src/payment-status'
import type { D1DatabaseLike } from '../../../cloudflare/worker/src/d1'
import type { PaymentRecord } from '@/types/payment-status'

const db = {} as D1DatabaseLike
const runtime = { randomUUID: () => crypto.randomUUID(), now: () => new Date('2026-09-05T00:00:00Z') }
const actor = { person: null, authMethod: 'password' } as const
const base = { month: '202609', operationId: crypto.randomUUID(), expectedRevision: 1, confirmedSignedYen: 50, paidOn: '2026-09-05' }
const entries = { incomes: [{ id: 'income', month: '202609', label: '給与', amount: 101, person: 'husband' as const }], expenses: [], carryovers: [] }
function setup(payments: PaymentRecord[] = []) {
  vi.spyOn(store, 'replayOperation').mockResolvedValue(null)
  vi.spyOn(store, 'readPaymentMonth').mockResolvedValue({ revision: 1, entries, payments })
  return vi.spyOn(store, 'writeOperation').mockResolvedValue({ operationId: base.operationId, month: base.month, revision: 2, paymentId: 'payment', voidedPaymentId: null })
}
afterEach(() => vi.restoreAllMocks())
describe('振込ドメイン', () => {
  it('最新の精算額と一致する実支払にsnapshotとactorを保存する', async () => {
    const write = setup()
    await recordPayment(db, runtime, { ...actor, householdId: 'A' }, base)
    expect(write).toHaveBeenCalledWith(db, { ...actor, householdId: 'A' }, runtime, expect.objectContaining({ actor: { ...actor, householdId: 'A' }, payment: expect.objectContaining({ signedYen: 50, snapshot: expect.objectContaining({ incomes: entries.incomes, calculationVersion: 'equal-surplus-v1' }) }) }))
  })
  it.each([{ expectedRevision: 0 }, { confirmedSignedYen: 51 }])('古い確認値は409: %j', async overrides => {
    const write = setup()
    await expect(recordPayment(db, runtime, { ...actor, householdId: 'A' }, { ...base, ...overrides })).rejects.toMatchObject({ status: 409 })
    expect(write).not.toHaveBeenCalled()
  })
  it.each([{ paidOn: '2026-09-06' }, { paidOn: '2026-02-30' }, { confirmedSignedYen: 0 }, { actor: 'wife' }])('不正入力を拒否: %j', async overrides => {
    setup()
    await expect(recordPayment(db, runtime, { ...actor, householdId: 'A' }, { ...base, ...overrides })).rejects.toMatchObject({ status: 400 })
  })
  it('再送は現在のrevisionを読まず当時の結果を返す', async () => {
    setup()
    const saved = { operationId: base.operationId, month: base.month, revision: 2, paymentId: 'payment', voidedPaymentId: null }
    vi.mocked(store.replayOperation).mockResolvedValue(saved)
    expect(await recordPayment(db, runtime, { ...actor, householdId: 'A' }, base)).toEqual(saved)
    expect(store.readPaymentMonth).not.toHaveBeenCalled()
  })
  it('存在しない支払の訂正は404', async () => {
    setup()
    await expect(correctPayment(db, runtime, { ...actor, householdId: 'A' }, { month:base.month, operationId:base.operationId, expectedRevision:1, paymentId:crypto.randomUUID(), reason:'誤操作', replacement:null })).rejects.toMatchObject({ status:404 })
  })
  it.each([null, { signedYen: 45, paidOn: '2026-09-04' }])('取消と置換を原子的な操作として保存する %j', async replacement => {
    const payment = { id:crypto.randomUUID(), signedYen:50, voidedAt:null } as PaymentRecord
    const write = setup([payment])
    await correctPayment(db, runtime, { ...actor, householdId: 'A' }, {month:base.month,operationId:base.operationId,expectedRevision:1,paymentId:payment.id,reason:'実額を確認',replacement})
    expect(write).toHaveBeenCalledWith(db, { ...actor, householdId: 'A' },runtime,expect.objectContaining({kind:replacement ? 'correct' : 'void',voidPayment:{id:payment.id,reason:'実額を確認'}}))
  })
  it('取消済みの支払は409', async () => {
    const payment = { id:crypto.randomUUID(), signedYen:50, voidedAt:'2026-09-05' } as PaymentRecord
    setup([payment])
    await expect(correctPayment(db, runtime, { ...actor, householdId: 'A' }, {month:base.month,operationId:base.operationId,expectedRevision:1,paymentId:payment.id,reason:'誤操作',replacement:null})).rejects.toMatchObject({status:409})
  })
  it('現在の計算結果を返す', async () => {
    setup()
    expect(await getPaymentStatus(db, { householdId: 'A' }, base.month)).toMatchObject({state:'unpaid',targetSignedYen:50})
  })
  it('別月の操作は返さない', async () => {
    vi.spyOn(store,'findOperation').mockResolvedValue({month:'202608',input_json:'{}',result_json:'{}'})
    expect(await getPaymentOperation(db, { householdId: 'A' }, base.month, base.operationId)).toBeNull()
  })
})
