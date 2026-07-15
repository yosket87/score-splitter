import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initStore } from '@/mocks/db'
import { server } from '@/mocks/server'

const API_URL = 'http://mock-worker.local'
const AUTHORIZATION = 'Bearer mock-worker-token'

describe('パスキーのモックAPI', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    initStore()
  })

  afterAll(() => {
    server.close()
  })

  it('登録がない場合は空のパスキー一覧を返す', async () => {
    const response = await fetch(`${API_URL}/passkeys`, {
      headers: { authorization: AUTHORIZATION },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: [] })
  })
})
