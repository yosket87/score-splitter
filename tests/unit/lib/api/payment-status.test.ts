vi.mock('@/lib/api/household-session', () => ({ householdSessionToken: () => Promise.resolve('cookie-session') }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ mode: vi.fn(), db: {}, runtime: {}, read: vi.fn(), record: vi.fn(), correct: vi.fn(), operation: vi.fn(), request: vi.fn(), cookie: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.cookie }) }))
vi.mock('@/lib/api/backend', () => ({ isWorkerApiMockEnabled: mocks.mode, getDatabase: () => mocks.db, getRuntime: () => mocks.runtime, runD1Operation: (fn: () => Promise<unknown>) => fn() }))
vi.mock('@/lib/api/client', () => ({ apiRequest: mocks.request }))
vi.mock('../../../../cloudflare/worker/src/payment-status', () => ({ getPaymentStatus: mocks.read, recordPayment: mocks.record, correctPayment: mocks.correct, getPaymentOperation: mocks.operation }))
import { correctPayment, getPaymentOperation, getPaymentStatus, recordPayment } from '@/lib/api/payment-status'
const actor = { person: null, authMethod: 'password' as const }
const input = { month: '202602', operationId: 'op', expectedRevision: 1, confirmedSignedYen: 15500, paidOn: '2026-02-28' }
const correction = { month: '202602', operationId: 'fix', expectedRevision: 2, paymentId: 'p', reason: '誤操作', replacement: null }
describe('振込アダプター', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.cookie.mockReturnValue({ value: 'cookie-session' }) })
  it('通常運用では共有D1関数を呼ぶ', async () => {
    mocks.mode.mockReturnValue(false)
    mocks.read.mockResolvedValue({ state: 'paid' }); mocks.record.mockResolvedValue({ paymentId: 'p' }); mocks.correct.mockResolvedValue({ voidedPaymentId: 'p' }); mocks.operation.mockResolvedValue(null)
    expect(await getPaymentStatus({ householdId: 'A' }, '202602')).toEqual({ state: 'paid' })
    expect(await recordPayment({ ...actor, householdId: 'A' }, input)).toEqual({ paymentId: 'p' })
    expect(mocks.record).toHaveBeenCalledWith(mocks.db, mocks.runtime, { ...actor, householdId: 'A' }, input)
    expect(await correctPayment({ ...actor, householdId: 'A' }, correction)).toEqual({ voidedPaymentId: 'p' })
    expect(await getPaymentOperation({ householdId: 'A' }, '202602', 'op')).toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('HTTPモックにはcookieセッションを渡しactor bodyを送らない', async () => {
    mocks.mode.mockReturnValue(true); mocks.request.mockResolvedValue({ data: { paymentId: 'p' } })
    await recordPayment({ ...actor, householdId: 'A' }, input)
    expect(mocks.request).toHaveBeenLastCalledWith('/months/202602/payments', { sessionToken: 'cookie-session', method: 'POST', body: input })
    await correctPayment({ ...actor, householdId: 'A' }, correction)
    expect(mocks.request).toHaveBeenLastCalledWith('/months/202602/payment-corrections', { sessionToken: 'cookie-session', method: 'POST', body: correction })
    await getPaymentStatus({ householdId: 'A' }, '202602')
    expect(mocks.request).toHaveBeenLastCalledWith('/months/202602/payment-status', { sessionToken: 'cookie-session' })
    await getPaymentOperation({ householdId: 'A' }, '202602', 'op')
    expect(mocks.request).toHaveBeenLastCalledWith('/months/202602/payment-operations/op', { sessionToken: 'cookie-session' })
  })
})
