import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initStore, insertRows } from '@/mocks/db'
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

  it('認証がない場合はパスキー一覧を返さない', async () => {
    const response = await fetch(`${API_URL}/passkeys`)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: '認証に失敗しました' })
  })

  it('担当者で絞り込み、フィールド変換後に登録日時の昇順で返す', async () => {
    insertRows('passkey_credentials', [
      {
        id: 'wife-new',
        person: 'wife',
        public_key_base64: 'BAUG',
        counter: 2,
        device_name: '新しい端末',
        transports: ['hybrid'],
        created_at: '2026-07-15T02:00:00.000Z',
      },
      {
        id: 'husband-middle',
        person: 'husband',
        public_key_base64: 'BwgJ',
        counter: 1,
        device_name: '夫の端末',
        transports: '["internal"]',
        created_at: '2026-07-15T01:00:00.000Z',
      },
      {
        id: 'wife-old',
        person: 'wife',
        public_key_base64: 'AQID',
        counter: 0,
        device_name: null,
        transports: '["internal","hybrid"]',
        created_at: '2026-07-15T00:00:00.000Z',
      },
    ])

    const response = await fetch(`${API_URL}/passkeys?person=wife`, {
      headers: { authorization: AUTHORIZATION },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 'wife-old',
          person: 'wife',
          publicKeyBase64: 'AQID',
          counter: 0,
          deviceName: null,
          transports: ['internal', 'hybrid'],
          createdAt: '2026-07-15T00:00:00.000Z',
        },
        {
          id: 'wife-new',
          person: 'wife',
          publicKeyBase64: 'BAUG',
          counter: 2,
          deviceName: '新しい端末',
          transports: ['hybrid'],
          createdAt: '2026-07-15T02:00:00.000Z',
        },
      ],
    })
  })
})
