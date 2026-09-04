import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntime } from '../../../cloudflare/worker/src/d1'
const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), record: vi.fn(), correct: vi.fn(), operation: vi.fn() }))
vi.mock('../../../cloudflare/worker/src/sessions', () => ({ getSession: mocks.session }))
vi.mock('../../../cloudflare/worker/src/payment-status', () => ({ getPaymentStatus: mocks.read, recordPayment: mocks.record, correctPayment: mocks.correct, getPaymentOperation: mocks.operation }))
import { routePaymentStatus } from '../../../cloudflare/worker/src/payment-router'
import type { WorkerRouteContext } from '../../../cloudflare/worker/src/ai-diagnosis-router'
function context(path: string, method = 'GET', body?: unknown): WorkerRouteContext {
  const url = new URL('https://worker.test' + path)
  return { url, parts: url.pathname.split('/').filter(Boolean), env: { DB: {} as WorkerRouteContext['env']['DB'], WORKER_API_TOKEN: 'internal' }, runtime: createRuntime(), request: new Request(url, { method, headers: { 'x-household-session': 'token' }, ...(body ? { body: JSON.stringify(body) } : {}) }) }
}
describe('振込HTTP入口', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ person: null, authMethod: 'password', expiresAt: '2099-01-01T00:00:00Z' }) })
  it('セッション期限切れや未認証は読取を拒否', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(routePaymentStatus(context('/months/202602/payment-status'))).rejects.toMatchObject({ status: 401 })
    mocks.session.mockResolvedValue({ expiresAt: '2020-01-01' })
    await expect(routePaymentStatus(context('/months/202602/payment-status'))).rejects.toMatchObject({ status: 401 })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('セッションから記録者を導出', async () => {
    mocks.record.mockResolvedValue({ operationId: 'op' })
    const c = context('/months/202602/payments', 'POST', { month: '202602' })
    const r = await routePaymentStatus(c)
    expect(await r?.json()).toEqual({ data: { operationId: 'op' } })
    expect(mocks.record).toHaveBeenCalledWith(c.env.DB, c.runtime, { month: '202602' }, { person: null, authMethod: 'password' })
  })
  it('URLとbodyの月が異なる書込を拒否', async () => {
    await expect(routePaymentStatus(context('/months/202602/payments', 'POST', { month: '202603' }))).rejects.toMatchObject({ status: 400 })
    expect(mocks.record).not.toHaveBeenCalled()
  })
  it('対象外の経路には介入しない', async () => {
    expect(await routePaymentStatus(context('/incomes'))).toBeNull()
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('状態と保存済み操作を読める', async () => {
    mocks.read.mockResolvedValue({ state: 'paid' }); mocks.operation.mockResolvedValue(null)
    expect(await (await routePaymentStatus(context('/months/202602/payment-status')))?.json()).toEqual({ data: { state: 'paid' } })
    const id='11111111-1111-4111-8111-111111111111'
    expect(await (await routePaymentStatus(context('/months/202602/payment-operations/' + id)))?.json()).toEqual({ data: null })
  })
})
