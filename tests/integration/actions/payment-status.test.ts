vi.mock('server-only', () => ({}))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
const mocks = vi.hoisted(() => ({
  session: vi.fn(), read: vi.fn(), record: vi.fn(), correct: vi.fn(), operation: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/webauthn/session', () => ({ getSession: mocks.session }))
vi.mock('@/lib/api/payment-status', () => ({ getPaymentStatus: mocks.read, recordPayment: mocks.record, correctPayment: mocks.correct, getPaymentOperation: mocks.operation }))
vi.mock('@/app/actions/revalidation', () => ({ revalidateHouseholdData: mocks.revalidate }))
import { getPaymentStatus, recordPayment, correctPayment, getPaymentOperation } from '@/app/actions/payment-status'

const input = { month: '202602', operationId: '11111111-1111-4111-8111-111111111111', expectedRevision: 1, confirmedSignedYen: 15500, paidOn: '2026-02-28' }
const result = { operationId: input.operationId, month: input.month, revision: 2, paymentId: 'p', voidedPaymentId: null }
describe('振込状況Actions', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ householdId: 'A', person: null, authMethod: 'password' }) })
  it('未認証では読取も書込も実行しない', async () => {
    mocks.session.mockResolvedValue(null)
    expect(await getPaymentStatus('202602', 'A')).toMatchObject({ success: false, code: 401 })
    expect(await recordPayment(input, 'A')).toMatchObject({ success: false, code: 401 })
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled()
  })
  it('記録者は共有ログインのセッションから導出し成功した月を再検証', async () => {
    mocks.record.mockResolvedValue(result)
    expect(await recordPayment(input, 'A')).toEqual({ success: true, data: result })
    expect(mocks.record).toHaveBeenCalledWith({ householdId: 'A', person: null, authMethod: 'password' }, input)
    expect(mocks.revalidate).toHaveBeenCalledWith('202602')
  })
  it('偽の記録者や不正金額を受け入れない', async () => {
    expect(await recordPayment({ ...input, actor: { person: 'wife' } } as typeof input, 'A')).toMatchObject({ success: false, code: 400 })
    expect(await recordPayment({ ...input, confirmedSignedYen: 0 }, 'A')).toMatchObject({ success: false, code: 400 })
    expect(mocks.record).not.toHaveBeenCalled()
  })
  it('競合は409、未知のエラーは安全な文言で返す', async () => {
    mocks.record.mockRejectedValueOnce(new ApiError('内容が変わりました', 409))
    expect(await recordPayment(input, 'A')).toMatchObject({ success: false, code: 409, error: '内容が変わりました' })
    mocks.read.mockRejectedValueOnce(new Error('secret sql'))
    expect(await getPaymentStatus('202602', 'A')).toEqual({ success: false, code: 500, error: '振込記録を取得できませんでした。もう一度お試しください。' })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('取消と訂正もセッション由来の記録者で実行する', async () => {
    const correction = { month: input.month, operationId: input.operationId, expectedRevision: 2, paymentId: '22222222-2222-4222-8222-222222222222', reason: '未送金のため', replacement: null }
    mocks.correct.mockResolvedValue({ ...result, paymentId: null, voidedPaymentId: correction.paymentId })
    expect(await correctPayment(correction, 'A')).toMatchObject({ success: true })
    expect(mocks.correct).toHaveBeenCalledWith({ householdId: 'A', person: null, authMethod: 'password' }, correction)
  })
  it('操作結果の照会は読取のみで不存在をnullで返す', async () => {
    mocks.operation.mockResolvedValue(null)
    expect(await getPaymentOperation('202602', input.operationId, 'A')).toEqual({ success: true, data: null })
    expect(mocks.revalidate).not.toHaveBeenCalled()
    expect(await getPaymentOperation('bad', input.operationId, 'A')).toMatchObject({ success: false, code: 400 })
  })

  it('画面とセッションの世帯が異なると読取・記録・訂正・結果照会を拒否する', async () => {
    mocks.session.mockResolvedValue({ householdId: 'B', person: null, authMethod: 'password' })
    const correction = { month: input.month, operationId: input.operationId, expectedRevision: 1, paymentId: '22222222-2222-4222-8222-222222222222', reason: '取消', replacement: null }
    for (const result of [
      await getPaymentStatus('202602', 'A'),
      await recordPayment(input, 'A'),
      await correctPayment(correction, 'A'),
      await getPaymentOperation('202602', input.operationId, 'A'),
    ]) expect(result).toMatchObject({ success: false, code: 403 })
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
    expect(mocks.correct).not.toHaveBeenCalled()
    expect(mocks.operation).not.toHaveBeenCalled()
  })

  it.each([undefined, null, '', ' ', 1, {}])('操作元世帯の欠落や不正値を拒否する: %s', async (householdId) => {
    expect(await recordPayment(input, householdId as string)).toMatchObject({ success: false, code: 403 })
    expect(mocks.record).not.toHaveBeenCalled()
  })

})
