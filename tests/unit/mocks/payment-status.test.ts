import { beforeEach, describe, expect, it } from 'vitest'
import { initStore, insertRows, updateRows, deleteRows } from '@/mocks/db'
import { getMockPaymentStatus, recordMockPayment, correctMockPayment } from '@/mocks/payment-status'
const actor = { person: null, authMethod: 'password' as const }
const makeInput = () => ({ month: '202602', operationId: crypto.randomUUID(), expectedRevision: getMockPaymentStatus('202602').revision, confirmedSignedYen: getMockPaymentStatus('202602').remainingSignedYen, paidOn: '2026-02-28' })
describe('振込モックは支払と編集を保持する', () => {
  beforeEach(() => initStore())
  it('振込登録と再送で二重支払を作らない', () => {
    const input = makeInput(); const result = recordMockPayment(input, actor)
    expect(recordMockPayment(input, actor)).toEqual(result)
    expect(getMockPaymentStatus('202602')).toMatchObject({ state: 'paid', netPaidSignedYen: 15500, remainingSignedYen: 0 })
    expect(getMockPaymentStatus('202602').payments).toHaveLength(1)
  })
  it('登録後の編集を許可し差額へ反映', () => {
    recordMockPayment(makeInput(), actor)
    const row = insertRows('incomes', [{ month: '202602', label: '追加', amount: 9000, person: 'husband' }])[0]
    expect(getMockPaymentStatus('202602')).toMatchObject({ state: 'difference', remainingSignedYen: 4500 })
    updateRows('incomes', { id: `eq.${row.id}` }, { amount: 10000 })
    expect(getMockPaymentStatus('202602').remainingSignedYen).toBe(5000)
    deleteRows('incomes', { id: `eq.${row.id}` })
    expect(getMockPaymentStatus('202602').state).toBe('paid')
  })
  it('訂正後の差額が安全整数を超える場合は保存しない', () => {
    const saved = recordMockPayment(makeInput(), actor)
    const before = getMockPaymentStatus('202602')
    expect(() => correctMockPayment({ month: '202602', operationId: crypto.randomUUID(), expectedRevision: before.revision, paymentId: saved.paymentId!, reason: '境界検証', replacement: { signedYen: -Number.MAX_SAFE_INTEGER, paidOn: '2026-02-28' } }, actor)).toThrow()
    expect(getMockPaymentStatus('202602')).toEqual(before)
  })
  it('古い確認を拒否し取消履歴を残す', () => {
    const stale = makeInput(); insertRows('incomes', [{ month: '202602', label: '追加', amount: 2, person: 'wife' }])
    expect(() => recordMockPayment(stale, actor)).toThrow()
    const saved = recordMockPayment(makeInput(), actor)
    correctMockPayment({ month: '202602', operationId: crypto.randomUUID(), expectedRevision: getMockPaymentStatus('202602').revision, paymentId: saved.paymentId!, reason: '誤操作', replacement: null }, actor)
    const status = getMockPaymentStatus('202602')
    expect(status.state).toBe('unpaid'); expect(status.payments[0].voidReason).toBe('誤操作')
  })
})
