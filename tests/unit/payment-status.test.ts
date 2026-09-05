import { describe, expect, it } from 'vitest'
import { buildPaymentStatus } from '@/lib/utils/payment-status'
import { recordPaymentSchema, assertPaymentDate } from '@/lib/validations/payment-status'
import type { PaymentRecord } from '@/types/payment-status'
const payment = (amount: number, voidedAt: string | null = null) => ({ signedYen: amount, voidedAt }) as PaymentRecord
const entries = (amount: number) => ({ incomes: [{ id: '1', month: '202609', label: '給与', amount: Math.abs(amount) * 2, person: amount >= 0 ? 'husband' as const : 'wife' as const }], expenses: [], carryovers: [] })
describe('振込状態', () => {
  it.each([[15500, 0, 'unpaid', 15500], [15500, 15500, 'paid', 0], [20000, 15500, 'difference', 4500], [10000, 15500, 'difference', -5500], [-10000, 15500, 'difference', -25500], [0, 15500, 'difference', -15500], [0, 0, 'unnecessary', 0]])('%sと支払%s', (target, paid, state, remaining) => {
    expect(buildPaymentStatus('202609', 1, entries(target), paid ? [payment(paid)] : [])).toMatchObject({ targetSignedYen: target, state, remainingSignedYen: remaining })
  })
  it('取消を除き、訂正した実額を集計する', () => expect(buildPaymentStatus('202609', 1, entries(15500), [payment(15500, 'now'), payment(15000)])).toMatchObject({ remainingSignedYen: 500 }))
  it.each([101, -101])('半円をゼロ方向へ丸める %s', amount => {
    const data = entries(amount / 2)
    expect(buildPaymentStatus('202609', 0, data, []).targetSignedYen).toBe(Math.trunc(amount / 2))
  })
  it('安全整数を超える途中和を拒否', () => expect(() => buildPaymentStatus('202609', 0, entries(Number.MAX_SAFE_INTEGER), [])).toThrow())
  it('日付は実在日かつ日本の当日以前', () => {
    expect(() => assertPaymentDate('2026-02-30', new Date('2026-09-05'))).toThrow()
    expect(() => assertPaymentDate('2026-09-06', new Date('2026-09-05T14:59:00Z'))).toThrow()
    expect(() => assertPaymentDate('2026-09-06', new Date('2026-09-05T15:00:00Z'))).not.toThrow()
  })
  it('入力に余分なactorや0円を許可しない', () => expect(recordPaymentSchema.safeParse({ month: '202609', operationId: crypto.randomUUID(), expectedRevision: 0, confirmedSignedYen: 0, paidOn: '2026-09-05', actor: 'wife' }).success).toBe(false))
})

describe('振込集計の整数境界', () => {
  it('安全整数範囲の最終合計は履歴の順序によらず計算できる', () => {
    const max = Number.MAX_SAFE_INTEGER
    for (const amounts of [[max, 1, -max], [-max, 1, max], [1, max, -max]]) {
      expect(buildPaymentStatus('202609', 0, { incomes: [], expenses: [], carryovers: [] }, amounts.map(amount => payment(amount))).netPaidSignedYen).toBe(1)
    }
  })
  it('最終支払合計が安全整数を超える場合は拒否', () => {
    expect(() => buildPaymentStatus('202609', 0, { incomes: [], expenses: [], carryovers: [] }, [payment(Number.MAX_SAFE_INTEGER), payment(1)])).toThrow()
  })
})
