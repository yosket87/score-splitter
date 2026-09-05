import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MOCK_LEGACY_HOUSEHOLD_ID } from '@/mocks/auth-handlers'
import { initStore, insertRows, getTable } from '@/mocks/db'
import { server } from '@/mocks/server'

const API_URL = 'http://mock-worker.local'
const AUTHORIZATION = 'Bearer mock-worker-token'
const TOKEN = 'a'.repeat(64)

describe('パスキーのモックAPI', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    initStore()
    insertRows('sessions', [{ token: TOKEN, household_id: MOCK_LEGACY_HOUSEHOLD_ID, person: null, auth_method: 'password', expires_at: new Date(Date.now() + 300000).toISOString() }])
  })

  afterAll(() => {
    server.close()
  })

  it('登録がない場合は空のパスキー一覧を返す', async () => {
    const response = await fetch(`${API_URL}/passkeys`, {
      headers: { authorization: AUTHORIZATION, 'x-household-session': TOKEN },
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
        household_id: MOCK_LEGACY_HOUSEHOLD_ID,
        person: 'wife',
        public_key_base64: 'BAUG',
        counter: 2,
        device_name: '新しい端末',
        transports: ['hybrid'],
        created_at: '2026-07-15T02:00:00.000Z',
      },
      {
        id: 'husband-middle',
        household_id: MOCK_LEGACY_HOUSEHOLD_ID,
        person: 'husband',
        public_key_base64: 'BwgJ',
        counter: 1,
        device_name: '夫の端末',
        transports: '["internal"]',
        created_at: '2026-07-15T01:00:00.000Z',
      },
      {
        id: 'wife-old',
        household_id: MOCK_LEGACY_HOUSEHOLD_ID,
        person: 'wife',
        public_key_base64: 'AQID',
        counter: 0,
        device_name: null,
        transports: '["internal","hybrid"]',
        created_at: '2026-07-15T00:00:00.000Z',
      },
    ])

    const response = await fetch(`${API_URL}/passkeys?person=wife`, {
      headers: { authorization: AUTHORIZATION, 'x-household-session': TOKEN },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 'wife-old',
        householdId: MOCK_LEGACY_HOUSEHOLD_ID,
          person: 'wife',
          publicKeyBase64: 'AQID',
          counter: 0,
          deviceName: null,
          transports: ['internal', 'hybrid'],
          createdAt: '2026-07-15T00:00:00.000Z',
        },
        {
          id: 'wife-new',
        householdId: MOCK_LEGACY_HOUSEHOLD_ID,
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


describe('モック認証の世帯・試行分離', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  beforeEach(() => {
    initStore()
    insertRows('households', [{ id: 'B', legacy_auth_key: null }])
    insertRows('sessions', [
      { token: TOKEN, household_id: MOCK_LEGACY_HOUSEHOLD_ID, person: null, auth_method: 'password', expires_at: '2099-01-01T00:00:00Z' },
      { token: 'b'.repeat(64), household_id: 'B', person: null, auth_method: 'password', expires_at: '2099-01-01T00:00:00Z' },
    ])
  })
  async function request(path: string, method = 'GET', body?: unknown, token?: string) {
    return fetch(`${API_URL}${path}`, { method, headers: { authorization: AUTHORIZATION, 'content-type': 'application/json', ...(token ? { 'x-household-session': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  it('Bearerだけの管理アクセスを拒否し、旧session発行URLを廃止する', async () => {
    expect((await request('/passkeys')).status).toBe(401)
    expect((await request('/sessions', 'POST', {})).status).toBe(404)
  })
  it('別世帯のパスキーを取得・削除できず、管理payloadで世帯を書き換えられない', async () => {
    const created = await request('/passkeys', 'POST', { id: 'key', householdId: 'B', person: 'wife', publicKeyBase64: 'AQID', counter: 0 }, TOKEN)
    expect(await created.json()).toMatchObject({ data: { householdId: MOCK_LEGACY_HOUSEHOLD_ID } })
    expect(await (await request('/passkeys/key', 'GET', undefined, 'b'.repeat(64))).json()).toEqual({ data: null })
    await request('/passkeys/key', 'DELETE', undefined, 'b'.repeat(64))
    expect(await (await request('/internal/auth/credentials/key')).json()).toMatchObject({ data: { id: 'key' } })
    await request('/internal/auth/credentials/key', 'PATCH', { householdId: MOCK_LEGACY_HOUSEHOLD_ID, counter: 3 })
    expect((await request('/internal/auth/credentials/key', 'PATCH', { householdId: MOCK_LEGACY_HOUSEHOLD_ID, counter: 2 })).status).toBe(409)
    expect(getTable('passkey_credentials')[0].counter).toBe(3)
  })
  it('認証前challengeはNULLで試行IDごとに一回だけ消費する', async () => {
    const input = { challenge: 'challenge', person: null, expiresAt: '2099-01-01T00:00:00Z', householdId: 'B' }
    const created = await (await request('/internal/auth/challenges', 'POST', input)).json() as { data: { id: string, householdId: unknown } }
    expect(created.data.householdId).toBeNull()
    expect(await (await request('/internal/auth/challenges/other-browser/consume', 'POST', { person: null })).json()).toEqual({ data: null })
    const responses = await Promise.all([request(`/internal/auth/challenges/${created.data.id}/consume`, 'POST', { person: null }), request(`/internal/auth/challenges/${created.data.id}/consume`, 'POST', { person: null })])
    const results = await Promise.all(responses.map((response) => response.json())) as { data: unknown }[]
    expect(results.filter(({ data }) => data)).toHaveLength(1)
  })
  it('登録challengeは同personでも世帯別に消費できる', async () => {
    const input = { challenge: 'challenge', person: 'wife', expiresAt: '2099-01-01T00:00:00Z' }
    const created = await (await request('/webauthn-challenges', 'POST', input, TOKEN)).json() as { data: { id: string } }
    const path = `/webauthn-challenges/${created.data.id}/consume`
    expect(await (await request(path, 'POST', { person: 'wife' }, 'b'.repeat(64))).json()).toEqual({ data: null })
    expect(await (await request(path, 'POST', { person: 'wife' }, TOKEN)).json()).toMatchObject({ data: { householdId: MOCK_LEGACY_HOUSEHOLD_ID } })
  })
  it('Bの新規ログインを拒否し、NULL所属sessionからfallbackしない', async () => {
    const response = await request('/internal/auth/sessions', 'POST', { token: 'c'.repeat(64), householdId: 'B', person: null, authMethod: 'password', expiresAt: '2099-01-01T00:00:00Z' })
    expect(response.status).toBe(401)
    getTable('sessions')[0].household_id = null
    expect(await (await request(`/internal/auth/sessions/${TOKEN}`)).json()).toEqual({ data: null })
  })
})
