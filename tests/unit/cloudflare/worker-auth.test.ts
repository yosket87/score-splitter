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

})
