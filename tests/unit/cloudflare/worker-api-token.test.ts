import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../../../cloudflare/worker/src/d1'
import { assertAuth, HttpError } from '../../../cloudflare/worker/src/http'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import { createEnv, createRequest, FakeD1Database } from '../../helpers/cloudflare-worker-fake'

const invalidBindings = [
  ['missing', undefined], ['empty', ''], ['null', null],
  ['number', 123], ['boolean', false], ['object', {}], ['array', ['dummy']],
] as const

afterEach(() => vi.restoreAllMocks())

describe('旧HTTP入口のBearer binding検証', () => {
  it.each(invalidBindings)('%sを補間したヘッダでも保護処理前に拒否する', async (_label, token) => {
    const db = new FakeD1Database()
    const prepare = vi.spyOn(db, 'prepare')
    const batch = vi.spyOn(db, 'batch')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = createRequest('/login-attempts/failure', { method: 'POST' })
    // Headersは末尾空白を除去するため、空bindingの完全一致ケースも直接再現する。
    vi.spyOn(request.headers, 'get').mockReturnValue(`Bearer ${token}`)
    const readBody = vi.spyOn(request, 'json')
    const env = { DB: db, ...(token === undefined ? {} : { WORKER_API_TOKEN: token }) } as Env

    expect(() => assertAuth(request, token)).toThrow(HttpError)
    const response = await handleRequest(request, env)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '認証に失敗しました' })
    expect(readBody).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    expect(batch).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it.each([undefined, 'Bearer wrong-token'])('正常bindingでも欠落・不一致ヘッダを拒否する: %s', async authorization => {
    const db = new FakeD1Database()
    const prepare = vi.spyOn(db, 'prepare')
    const request = createRequest('/login-attempts/failure', {
      method: 'POST', headers: authorization ? { authorization } : {},
      body: JSON.stringify({ key: 'dummy-key' }),
    })
    const response = await handleRequest(request, createEnv(db))
    expect(response.status).toBe(401)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('正常bindingと一致するヘッダは保護ハンドラーを実行する', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(createRequest('/login-attempts/failure', {
      method: 'POST', headers: { authorization: 'Bearer secret-token' },
      body: JSON.stringify({ key: 'dummy-key' }),
    }), createEnv(db))
    expect(response.status).toBe(200)
    expect(db.executed.some(item => item.query.startsWith('INSERT INTO login_attempts'))).toBe(true)
  })

  it.each(invalidBindings)('%sでも公開waitlistは登録できる', async (_label, token) => {
    const db = new FakeD1Database()
    const env = { DB: db, ...(token === undefined ? {} : { WORKER_API_TOKEN: token }) } as Env
    const response = await handleRequest(createRequest('/waitlist', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dummy@example.com', priceIntent: 'free_only', simulatorUsed: false }),
    }), env)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { registered: true } })
    expect(db.executed.some(item => item.query.includes('INSERT INTO waitlist_entries'))).toBe(true)
  })
})
