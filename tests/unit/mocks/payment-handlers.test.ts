import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { createPaymentHandlers } from '@/mocks/payment-handlers'
import { initStore, insertRows } from '@/mocks/db'
const base = 'http://payment-mock.local'
const server = setupServer(...createPaymentHandlers(base, 'internal'))
const headers = { authorization: 'Bearer internal', 'x-household-session': 'a'.repeat(64), 'content-type': 'application/json' }
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  initStore()
  insertRows('sessions', [{ household_id: '3975b870-bbfa-49fd-ae3d-d273c9f6e107', token: 'a'.repeat(64), person: null, auth_method: 'password', expires_at: '2099-01-01T00:00:00Z' }])
})
describe('振込モックHTTP', () => {
  it('状態の3区間パスと結果照会の4区間パスを処理', async () => {
    const status = await fetch(`${base}/months/202602/payment-status`, { headers })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ data: { state: 'unpaid', remainingSignedYen: 15500 } })
    const result = await fetch(`${base}/months/202602/payment-operations/11111111-1111-4111-8111-111111111111`, { headers })
    expect(await result.json()).toEqual({ data: null })
  })
  it('未認証を拒否する', async () => {
    expect((await fetch(`${base}/months/202602/payment-status`)).status).toBe(401)
  })
})
