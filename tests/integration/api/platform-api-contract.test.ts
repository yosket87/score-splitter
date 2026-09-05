import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockCookies } from '../../mocks/next'
const household = { householdId: 'A' }

vi.mock('server-only', () => ({}))

const WORKER_URL = 'https://worker.example.test'
const WORKER_TOKEN = 'worker-secret'

interface CapturedRequest {
  method: string
  pathname: string
  searchParams: URLSearchParams
  authorization: string | null
  contentType: string | null
  body?: unknown
}

const capturedRequests: CapturedRequest[] = []
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  capturedRequests.length = 0
  vi.unstubAllEnvs()
})
afterAll(() => server.close())
beforeEach(() => {
  vi.stubEnv('USE_MOCKS', 'true')
  vi.stubEnv('CLOUDFLARE_WORKER_API_URL', WORKER_URL)
  vi.stubEnv('CLOUDFLARE_WORKER_API_TOKEN', WORKER_TOKEN)
})
async function captureRequest(request: Request): Promise<void> {
  const url = new URL(request.url)
  capturedRequests.push({
    method: request.method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    authorization: request.headers.get('authorization'),
    contentType: request.headers.get('content-type'),
    body: request.body ? await request.json() : undefined,
  })
}
import { copyMonthData, getCopyMonthPreview } from '@/lib/api/copy-month'
import { ApiError } from '@/lib/api/client'
import { createSession, getSession } from '@/lib/api/sessions'
import {
  createChallenge,
  createPasskey,
  consumeChallenge,
  getPasskey,
  listPasskeys,
} from '@/lib/api/passkeys'
import { getMonthlyAmounts } from '@/lib/api/monthly-summary'
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
} from '@/lib/api/login-attempts'
import type { CopyMonthOptions } from '@/types'

describe('lib/api copy-month contract', () => {
  it('プレビュー取得でsourceMonthとtargetMonthをクエリに載せる', async () => {
    server.use(
      http.get(`${WORKER_URL}/copy-month/preview`, ({ request }) => {
        captureRequest(request)
        const url = new URL(request.url)
        return HttpResponse.json({
          data: {
            sourceMonth: url.searchParams.get('sourceMonth'),
            targetMonth: url.searchParams.get('targetMonth'),
            items: [
              {
                id: 'income-1',
                label: '給料',
                amount: 300000,
                person: 'husband',
                type: 'income',
              },
            ],
            carryoverCount: 1,
            existingCount: 0,
          },
        })
      })
    )

    const preview = await getCopyMonthPreview('202602', '202603')

    expect(preview).toEqual({
      sourceMonth: '202602',
      targetMonth: '202603',
      items: [
        {
          id: 'income-1',
          label: '給料',
          amount: 300000,
          person: 'husband',
          type: 'income',
        },
      ],
      carryoverCount: 1,
      existingCount: 0,
    })
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'GET',
        pathname: '/copy-month/preview',
        authorization: `Bearer ${WORKER_TOKEN}`,
      })
    )
    expect(capturedRequests[0].searchParams.get('sourceMonth')).toBe('202602')
    expect(capturedRequests[0].searchParams.get('targetMonth')).toBe('202603')
  })

  it('コピー実行でオプションをJSON bodyとして送る', async () => {
    server.use(
      http.post(`${WORKER_URL}/copy-month`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({
          success: true,
          copied: { incomes: 1, expenses: 1, carryovers: 0 },
          skipped: { incomes: 0, expenses: 0, carryovers: 0 },
        })
      })
    )
    const options: CopyMonthOptions = {
      sourceMonth: '202602',
      targetMonth: '202603',
      mode: 'add',
      includeCarryover: false,
      selectedItems: [
        {
          id: 'income-1',
          label: '給料',
          amount: 300000,
          person: 'husband',
          type: 'income',
          itemCopyMode: 'withAmount',
        },
        {
          id: 'expense-1',
          label: '家賃',
          amount: -120000,
          person: 'wife',
          type: 'expense',
          itemCopyMode: 'labelOnly',
        },
      ],
    }

    const result = await copyMonthData(options)

    expect(result).toEqual({
      success: true,
      copied: { incomes: 1, expenses: 1, carryovers: 0 },
      skipped: { incomes: 0, expenses: 0, carryovers: 0 },
    })
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'POST',
        pathname: '/copy-month',
        authorization: `Bearer ${WORKER_TOKEN}`,
        contentType: 'application/json',
        body: options,
      })
    )
  })

  it('コピー結果が契約外なら502を返す', async () => {
    server.use(
      http.post(`${WORKER_URL}/copy-month`, () =>
        HttpResponse.json({ success: true, copied: {}, skipped: {} })
      )
    )

    await expect(
      copyMonthData({
        sourceMonth: '202602',
        targetMonth: '202603',
        mode: 'add',
        includeCarryover: false,
        selectedItems: [],
      })
    ).rejects.toEqual(new ApiError('Worker APIレスポンスの形式が不正です', 502))
  })
})

describe('lib/api sessions contract', () => {
  it('セッションレスポンスを検証し、未検出のnullを許可する', async () => {
    server.use(
      http.post(`${WORKER_URL}/internal/auth/sessions`, () =>
        HttpResponse.json({
          data: {
            token: 'session-token',
            householdId: 'A',
            person: 'husband',
            authMethod: 'passkey',
            expiresAt: '2026-03-01T00:00:00.000Z',
          },
        })
      ),
      http.get(`${WORKER_URL}/internal/auth/sessions/:token`, () => HttpResponse.json({ data: null }))
    )

    await expect(
      createSession(household, {
        token: 'session-token',
        person: 'husband',
        authMethod: 'passkey',
        expiresAt: '2026-03-01T00:00:00.000Z',
      })
    ).resolves.toEqual(expect.objectContaining({ token: 'session-token', person: 'husband' }))
    await expect(getSession('missing-token')).resolves.toBeNull()
  })

  it('セッションレスポンスが契約外なら502を返す', async () => {
    server.use(
      http.get(`${WORKER_URL}/internal/auth/sessions/:token`, () =>
        HttpResponse.json({ data: { token: 'broken-session' } })
      )
    )

    await expect(getSession('broken-session')).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })
})
describe('lib/api passkeys contract', () => {
  beforeEach(() => {
    mockCookies.get.mockReturnValue({ value: 'a'.repeat(64) })
    server.use(http.get(`${WORKER_URL}/internal/auth/sessions/:token`, () => HttpResponse.json({ data: {
      token: 'a'.repeat(64), householdId: 'A', person: null, authMethod: 'password', expiresAt: '2099-01-01T00:00:00.000Z',
    } })))
  })
  it('パスキーとチャレンジのレスポンスを検証し、未検出のnullを許可する', async () => {
    const passkey = {
      id: 'credential-1',
      householdId: 'A',
      person: 'wife' as const,
      publicKeyBase64: 'public-key',
      counter: 1,
      deviceName: null,
      transports: ['internal'],
      createdAt: '2026-03-01T00:00:00.000Z',
    }
    const challenge = {
      id: 'challenge-1',
      householdId: 'A',
      challenge: 'challenge-value',
      type: 'registration' as const,
      person: 'wife' as const,
      expiresAt: '2026-03-01T00:05:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
    }
    server.use(
      http.get(`${WORKER_URL}/passkeys`, () => HttpResponse.json({ data: [passkey] })),
      http.post(`${WORKER_URL}/passkeys`, () => HttpResponse.json({ data: passkey })),
      http.get(`${WORKER_URL}/passkeys/:id`, () => HttpResponse.json({ data: null })),
      http.post(`${WORKER_URL}/webauthn-challenges`, () =>
        HttpResponse.json({ data: challenge })
      ),
      http.post(`${WORKER_URL}/internal/auth/challenges/:id/consume`, () =>
        HttpResponse.json({ data: null })
      )
    )

    await expect(listPasskeys(household, 'wife')).resolves.toEqual([passkey])
    await expect(
      createPasskey(household, {
        id: passkey.id,
        person: passkey.person,
        publicKeyBase64: passkey.publicKeyBase64,
        counter: passkey.counter,
        deviceName: passkey.deviceName,
        transports: passkey.transports,
      })
    ).resolves.toEqual(passkey)
    await expect(getPasskey(household, 'missing')).resolves.toBeNull()
    await expect(
      createChallenge({ type: 'registration', context: household }, {
        challenge: challenge.challenge,
        person: challenge.person,
        expiresAt: challenge.expiresAt,
      })
    ).resolves.toEqual(challenge)
    await expect(
      consumeChallenge({ type: 'authentication' }, 'id', null)
    ).resolves.toBeNull()
  })

  it('パスキー一覧の要素が契約外なら502を返す', async () => {
    server.use(
      http.get(`${WORKER_URL}/passkeys`, () =>
        HttpResponse.json({ data: [{ id: 'broken-passkey' }] })
      )
    )

    await expect(listPasskeys(household)).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })
})

describe('lib/api monthly-summary contract', () => {
  it('月別金額レスポンスを検証する', async () => {
    server.use(
      http.get(`${WORKER_URL}/monthly-amounts`, () =>
        HttpResponse.json({
          data: {
            incomes: [{ month: '202603', amount: 300000 }],
            expenses: [{ month: '202603', amount: -120000 }],
          },
        })
      )
    )

    await expect(getMonthlyAmounts()).resolves.toEqual({
      incomes: [{ month: '202603', amount: 300000 }],
      expenses: [{ month: '202603', amount: -120000 }],
    })
  })

  it('月別金額レスポンスが契約外なら502を返す', async () => {
    server.use(
      http.get(`${WORKER_URL}/monthly-amounts`, () =>
        HttpResponse.json({ data: { incomes: [], expenses: [{ month: '202603' }] } })
      )
    )

    await expect(getMonthlyAmounts()).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })
})

describe('lib/api login-attempts contract', () => {
  it('ログイン試行レスポンスのオプショナルな待機秒数を検証する', async () => {
    server.use(
      http.post(`${WORKER_URL}/login-attempts/check`, () =>
        HttpResponse.json({ data: { allowed: true } })
      ),
      http.post(`${WORKER_URL}/login-attempts/failure`, () =>
        HttpResponse.json({ data: { allowed: false, retryAfterSeconds: 60 } })
      )
    )

    await expect(checkLoginRateLimit('login-key')).resolves.toEqual({ allowed: true })
    await expect(recordFailedLoginAttempt('login-key')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
  })

  it('ログイン試行レスポンスが契約外なら502を返す', async () => {
    server.use(
      http.post(`${WORKER_URL}/login-attempts/check`, () =>
        HttpResponse.json({ data: { allowed: 'yes' } })
      )
    )

    await expect(checkLoginRateLimit('login-key')).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })
})
