import { describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import {
  FakeD1Database,
  createEnv,
  createRequest,
} from '../../helpers/cloudflare-worker-fake'

describe('Cloudflare Worker 認証関連API', () => {
  it('ログイン失敗回数を記録して状態取得できる', async () => {
    const db = new FakeD1Database()
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const failureResponse = await handleRequest(
      createRequest('/login-attempts/failure', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'login-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(failureResponse.json()).resolves.toEqual({
      data: { allowed: true },
    })

    const checkResponse = await handleRequest(
      createRequest('/login-attempts/check', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'login-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(checkResponse.json()).resolves.toEqual({
      data: { allowed: true },
    })
    expect(
      db.executed.some((item) => item.query.startsWith('INSERT INTO login_attempts'))
    ).toBe(true)
  })

  it('ログイン失敗が上限に達したキーはロック状態を返す', async () => {
    const db = new FakeD1Database({
      loginAttempts: [
        {
          attempt_key: 'locked-key',
          count: 10,
          window_start: '2026-02-03T04:00:00.000Z',
          updated_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })

    const response = await handleRequest(
      createRequest('/login-attempts/check', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'locked-key' }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')) }
    )

    await expect(response.json()).resolves.toEqual({
      data: { allowed: false, retryAfterSeconds: 594 },
    })
  })

  it('ログイン成功時に失敗回数をリセットできる', async () => {
    const db = new FakeD1Database({
      loginAttempts: [
        {
          attempt_key: 'reset-key',
          count: 10,
          window_start: '2026-02-03T04:00:00.000Z',
          updated_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const resetResponse = await handleRequest(
      createRequest('/login-attempts/reset', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'reset-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(resetResponse.json()).resolves.toEqual({ success: true })

    const checkResponse = await handleRequest(
      createRequest('/login-attempts/check', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'reset-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(checkResponse.json()).resolves.toEqual({
      data: { allowed: true },
    })
  })

  it('期限切れのログイン失敗windowは新しい失敗記録でリセットされる', async () => {
    const db = new FakeD1Database({
      loginAttempts: [
        {
          attempt_key: 'expired-key',
          count: 10,
          window_start: '2026-02-03T04:00:00.000Z',
          updated_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })

    const response = await handleRequest(
      createRequest('/login-attempts/failure', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'expired-key' }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-02-03T04:20:00.000Z')) }
    )

    await expect(response.json()).resolves.toEqual({
      data: { allowed: true },
    })
    expect(db.executed).toContainEqual({
      query:
        'UPDATE login_attempts SET count = ?, window_start = ?, updated_at = ? WHERE attempt_key = ?',
      params: [
        1,
        '2026-02-03T04:20:00.000Z',
        '2026-02-03T04:20:00.000Z',
        'expired-key',
      ],
    })
  })

  it('セッションを作成・取得・削除できる', async () => {
    const db = new FakeD1Database()
    const token = 'a'.repeat(64)
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const createResponse = await handleRequest(
      createRequest('/sessions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token,
          person: 'wife',
          authMethod: 'passkey',
          expiresAt: '2026-02-10T04:05:06.000Z',
        }),
      }),
      createEnv(db),
      { now }
    )

    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual({
      data: {
        token,
        person: 'wife',
        authMethod: 'passkey',
        expiresAt: '2026-02-10T04:05:06.000Z',
      },
    })

    const getResponse = await handleRequest(
      createRequest(`/sessions/${token}`, {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    await expect(getResponse.json()).resolves.toEqual({
      data: {
        token,
        person: 'wife',
        authMethod: 'passkey',
        expiresAt: '2026-02-10T04:05:06.000Z',
      },
    })

    const deleteResponse = await handleRequest(
      createRequest(`/sessions/${token}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    await expect(deleteResponse.json()).resolves.toEqual({ success: true })
    const afterDeleteResponse = await handleRequest(
      createRequest(`/sessions/${token}`, {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(afterDeleteResponse.json()).resolves.toEqual({ data: null })
  })

  it('パスキーを作成・一覧取得・カウンター更新・削除できる', async () => {
    const db = new FakeD1Database({ passkeys: [] })
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const createResponse = await handleRequest(
      createRequest('/passkeys', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'credential-new',
          person: 'husband',
          publicKeyBase64: 'AQID',
          counter: 0,
          deviceName: 'MacBook',
          transports: ['internal', 'hybrid'],
        }),
      }),
      createEnv(db),
      { now }
    )

    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual({
      data: {
        id: 'credential-new',
        person: 'husband',
        publicKeyBase64: 'AQID',
        counter: 0,
        deviceName: 'MacBook',
        transports: ['internal', 'hybrid'],
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })

    const listResponse = await handleRequest(
      createRequest('/passkeys?person=husband', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(listResponse.json()).resolves.toEqual({
      data: [
        {
          id: 'credential-new',
          person: 'husband',
          publicKeyBase64: 'AQID',
          counter: 0,
          deviceName: 'MacBook',
          transports: ['internal', 'hybrid'],
          createdAt: '2026-02-03T04:05:06.000Z',
        },
      ],
    })

    const patchResponse = await handleRequest(
      createRequest('/passkeys/credential-new', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ counter: 3 }),
      }),
      createEnv(db)
    )
    await expect(patchResponse.json()).resolves.toEqual({ success: true })

    const getResponse = await handleRequest(
      createRequest('/passkeys/credential-new', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(getResponse.json()).resolves.toMatchObject({
      data: { id: 'credential-new', counter: 3 },
    })

    const deleteResponse = await handleRequest(
      createRequest('/passkeys/credential-new', {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(deleteResponse.json()).resolves.toEqual({ success: true })
  })

  it('WebAuthnチャレンジを作成・最新取得・削除できる', async () => {
    const db = new FakeD1Database()
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))
    const randomUUID = vi.fn(() => 'challenge-id')

    const createResponse = await handleRequest(
      createRequest('/webauthn-challenges', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          challenge: 'registration-challenge',
          type: 'registration',
          person: 'husband',
          expiresAt: '2026-02-03T04:10:06.000Z',
        }),
      }),
      createEnv(db),
      { now, randomUUID }
    )

    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual({
      data: {
        id: 'challenge-id',
        challenge: 'registration-challenge',
        type: 'registration',
        person: 'husband',
        expiresAt: '2026-02-03T04:10:06.000Z',
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })

    const latestResponse = await handleRequest(
      createRequest('/webauthn-challenges/latest?type=registration&person=husband', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(latestResponse.json()).resolves.toEqual({
      data: {
        id: 'challenge-id',
        challenge: 'registration-challenge',
        type: 'registration',
        person: 'husband',
        expiresAt: '2026-02-03T04:10:06.000Z',
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })

    const deleteResponse = await handleRequest(
      createRequest('/webauthn-challenges?type=registration&person=husband', {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(deleteResponse.json()).resolves.toEqual({ success: true })
  })

  it('期限切れWebAuthnチャレンジを削除できる', async () => {
    const db = new FakeD1Database({
      challenges: [
        {
          id: 'expired-challenge',
          challenge: 'expired',
          type: 'authentication',
          person: null,
          expires_at: '2026-02-03T04:00:00.000Z',
          created_at: '2026-02-03T03:55:00.000Z',
        },
        {
          id: 'active-challenge',
          challenge: 'active',
          type: 'authentication',
          person: null,
          expires_at: '2026-02-03T04:10:00.000Z',
          created_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })

    const deleteResponse = await handleRequest(
      createRequest('/webauthn-challenges/expired?before=2026-02-03T04:05:00.000Z', {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    await expect(deleteResponse.json()).resolves.toEqual({ success: true })

    const latestResponse = await handleRequest(
      createRequest('/webauthn-challenges/latest?type=authentication', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(latestResponse.json()).resolves.toMatchObject({
      data: { id: 'active-challenge', challenge: 'active' },
    })
  })

})
