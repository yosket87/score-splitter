import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCarryover,
  createExpense,
  createIncome,
  deleteCarryover,
  deleteExpense,
  deleteIncome,
  getCarryoversByMonth,
  getExpensesByMonth,
  getIncomesByMonth,
  toggleCarryoverCleared,
  toggleExpenseCarryover,
  updateCarryover,
  updateExpense,
  updateIncome,
} from '@/lib/api/records'
import { copyMonthData, getCopyMonthPreview } from '@/lib/api/copy-month'
import { ApiError } from '@/lib/api/client'
import { createSession, getSession } from '@/lib/api/sessions'
import {
  createChallenge,
  createPasskey,
  getLatestChallenge,
  getPasskey,
  listPasskeys,
} from '@/lib/api/passkeys'
import { getMonthlyAmounts } from '@/lib/api/monthly-summary'
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
} from '@/lib/api/login-attempts'
import {
  acquireDiagnosisLease,
  getDiagnosisContext,
  getSavedDiagnosis,
  releaseDiagnosisLease,
  saveDiagnosis,
  saveExpenseCategories,
} from '@/lib/api/ai-diagnosis'
import type { CopyMonthOptions } from '@/types'

const WORKER_URL = 'https://worker.example.test'
const WORKER_TOKEN = 'worker-secret'
const diagnosisView = {
  month: '202601',
  summaryText: '今月の家計は安定しています',
  currentExpenseTotal: 120000,
  baselineExpenseAverage: 115000,
  unresolvedCarryoverTotal: 10000,
  notableChanges: [],
  positivePoints: [],
  suggestions: [],
  dataSufficiency: 'full' as const,
}

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

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
  capturedRequests.length = 0
  vi.unstubAllEnvs()
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  vi.stubEnv('CLOUDFLARE_WORKER_API_URL', WORKER_URL)
  vi.stubEnv('CLOUDFLARE_WORKER_API_TOKEN', WORKER_TOKEN)
})

describe('lib/api records contract', () => {
  it('月指定の一覧取得で正しいURLと認証ヘッダを使う', async () => {
    server.use(
      http.get(`${WORKER_URL}/:table`, ({ params, request }) => {
        captureRequest(request)
        const table = params.table as string
        const month = new URL(request.url).searchParams.get('month')

        if (table === 'incomes') {
          return HttpResponse.json({
            data: [
              {
                id: 'income-1',
                month,
                label: '給料',
                amount: 300000,
                person: 'husband',
                createdAt: '2026-02-01T00:00:00.000Z',
              },
            ],
          })
        }

        if (table === 'expenses') {
          return HttpResponse.json({
            data: [
              {
                id: 'expense-1',
                month,
                label: '家賃',
                amount: -120000,
                person: 'wife',
                isCarryover: false,
                createdAt: '2026-02-02T00:00:00.000Z',
              },
            ],
          })
        }

        return HttpResponse.json({
          data: [
            {
              id: 'carryover-1',
              month,
              label: '前月繰越',
              amount: -5000,
              person: 'husband',
              isCleared: false,
              createdAt: '2026-02-03T00:00:00.000Z',
            },
          ],
        })
      })
    )

    const [incomes, expenses, carryovers] = await Promise.all([
      getIncomesByMonth('202602'),
      getExpensesByMonth('202602'),
      getCarryoversByMonth('202602'),
    ])

    expect(incomes).toEqual([
      expect.objectContaining({ id: 'income-1', month: '202602', amount: 300000 }),
    ])
    expect(expenses).toEqual([
      expect.objectContaining({
        id: 'expense-1',
        month: '202602',
        amount: -120000,
        isCarryover: false,
      }),
    ])
    expect(carryovers).toEqual([
      expect.objectContaining({
        id: 'carryover-1',
        month: '202602',
        amount: -5000,
        isCleared: false,
      }),
    ])
    expect(capturedRequests).toEqual([
      expect.objectContaining({
        method: 'GET',
        pathname: '/incomes',
        authorization: `Bearer ${WORKER_TOKEN}`,
      }),
      expect.objectContaining({
        method: 'GET',
        pathname: '/expenses',
        authorization: `Bearer ${WORKER_TOKEN}`,
      }),
      expect.objectContaining({
        method: 'GET',
        pathname: '/carryovers',
        authorization: `Bearer ${WORKER_TOKEN}`,
      }),
    ])
    expect(capturedRequests.map((request) => request.searchParams.get('month'))).toEqual([
      '202602',
      '202602',
      '202602',
    ])
  })

  it('収入の作成・更新・削除をWorker契約どおりに呼び出す', async () => {
    server.use(
      http.post(`${WORKER_URL}/incomes`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json(
          {
            data: {
              id: 'income-1',
              month: '202603',
              label: '給料',
              amount: 320000,
              person: 'husband',
              createdAt: '2026-03-01T00:00:00.000Z',
            },
          },
          { status: 201 }
        )
      }),
      http.patch(`${WORKER_URL}/incomes/:id`, async ({ params, request }) => {
        await captureRequest(request)
        return HttpResponse.json({
          data: {
            id: params.id,
            month: '202603',
            label: '給料更新',
            amount: 330000,
            person: 'wife',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        })
      }),
      http.delete(`${WORKER_URL}/incomes/:id`, ({ request }) => {
        captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )

    const created = await createIncome({
      month: '202603',
      label: '給料',
      amount: 320000,
      person: 'husband',
    })
    const updated = await updateIncome('income/1', {
      month: '202603',
      label: '給料更新',
      amount: 330000,
      person: 'wife',
    })
    await deleteIncome('income/1')

    expect(created.id).toBe('income-1')
    expect(updated).toEqual(expect.objectContaining({ id: 'income/1', label: '給料更新' }))
    expect(capturedRequests).toEqual([
      expect.objectContaining({
        method: 'POST',
        pathname: '/incomes',
        contentType: 'application/json',
        body: {
          month: '202603',
          label: '給料',
          amount: 320000,
          person: 'husband',
        },
      }),
      expect.objectContaining({
        method: 'PATCH',
        pathname: '/incomes/income%2F1',
        contentType: 'application/json',
        body: {
          month: '202603',
          label: '給料更新',
          amount: 330000,
          person: 'wife',
        },
      }),
      expect.objectContaining({
        method: 'DELETE',
        pathname: '/incomes/income%2F1',
      }),
    ])
  })

  it('支出の作成・更新・繰越切替・削除をWorker契約どおりに呼び出す', async () => {
    server.use(
      http.post(`${WORKER_URL}/expenses`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({
          data: {
            id: 'expense-1',
            month: '202603',
            label: '家賃',
            amount: -120000,
            person: 'husband',
            isCarryover: false,
            createdAt: '2026-03-02T00:00:00.000Z',
          },
        })
      }),
      http.patch(`${WORKER_URL}/expenses/:id`, async ({ params, request }) => {
        await captureRequest(request)
        return HttpResponse.json({
          data: {
            id: params.id,
            month: '202603',
            label: '家賃更新',
            amount: -121000,
            person: 'wife',
            isCarryover: true,
            createdAt: '2026-03-02T00:00:00.000Z',
          },
        })
      }),
      http.patch(`${WORKER_URL}/expenses/:id/carryover`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      }),
      http.delete(`${WORKER_URL}/expenses/:id`, ({ request }) => {
        captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )

    const created = await createExpense({
      month: '202603',
      label: '家賃',
      amount: -120000,
      person: 'husband',
      isCarryover: false,
    })
    const updated = await updateExpense('expense-1', {
      month: '202603',
      label: '家賃更新',
      amount: -121000,
      person: 'wife',
      isCarryover: true,
    })
    await toggleExpenseCarryover('expense-1', true)
    await deleteExpense('expense-1')

    expect(created.id).toBe('expense-1')
    expect(updated.isCarryover).toBe(true)
    expect(capturedRequests.map((request) => request.pathname)).toEqual([
      '/expenses',
      '/expenses/expense-1',
      '/expenses/expense-1/carryover',
      '/expenses/expense-1',
    ])
    expect(capturedRequests.map((request) => request.body)).toEqual([
      {
        month: '202603',
        label: '家賃',
        amount: -120000,
        person: 'husband',
        isCarryover: false,
      },
      {
        month: '202603',
        label: '家賃更新',
        amount: -121000,
        person: 'wife',
        isCarryover: true,
      },
      { isCarryover: true },
      undefined,
    ])
  })

  it('繰越の作成・更新・清算切替・削除をWorker契約どおりに呼び出す', async () => {
    server.use(
      http.post(`${WORKER_URL}/carryovers`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({
          data: {
            id: 'carryover-1',
            month: '202603',
            label: '前月繰越',
            amount: -5000,
            person: 'husband',
            isCleared: false,
            createdAt: '2026-03-03T00:00:00.000Z',
          },
        })
      }),
      http.patch(`${WORKER_URL}/carryovers/:id`, async ({ params, request }) => {
        await captureRequest(request)
        return HttpResponse.json({
          data: {
            id: params.id,
            month: '202603',
            label: '前月繰越更新',
            amount: -6000,
            person: 'wife',
            isCleared: true,
            createdAt: '2026-03-03T00:00:00.000Z',
          },
        })
      }),
      http.patch(`${WORKER_URL}/carryovers/:id/cleared`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      }),
      http.delete(`${WORKER_URL}/carryovers/:id`, ({ request }) => {
        captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )

    const created = await createCarryover({
      month: '202603',
      label: '前月繰越',
      amount: -5000,
      person: 'husband',
      isCleared: false,
    })
    const updated = await updateCarryover('carryover-1', {
      month: '202603',
      label: '前月繰越更新',
      amount: -6000,
      person: 'wife',
      isCleared: true,
    })
    await toggleCarryoverCleared('carryover-1', true)
    await deleteCarryover('carryover-1')

    expect(created.id).toBe('carryover-1')
    expect(updated.isCleared).toBe(true)
    expect(capturedRequests.map((request) => request.pathname)).toEqual([
      '/carryovers',
      '/carryovers/carryover-1',
      '/carryovers/carryover-1/cleared',
      '/carryovers/carryover-1',
    ])
    expect(capturedRequests.map((request) => request.body)).toEqual([
      {
        month: '202603',
        label: '前月繰越',
        amount: -5000,
        person: 'husband',
        isCleared: false,
      },
      {
        month: '202603',
        label: '前月繰越更新',
        amount: -6000,
        person: 'wife',
        isCleared: true,
      },
      { isCleared: true },
      undefined,
    ])
  })
})

describe('lib/api ai-diagnosis contract', () => {
  it('診断コンテキストをBearer認証付き月別パスから取得する', async () => {
    server.use(
      http.get(`${WORKER_URL}/ai-diagnoses/:month/context`, ({ params, request }) => {
        captureRequest(request)
        return HttpResponse.json({
          data: {
            targetMonth: params.month,
            incomes: [{ month: params.month, amount: 300000 }],
            expenses: [
              {
                id: 'expense-1',
                month: params.month,
                label: '家賃',
                amount: -120000,
                isCarryover: false,
                aiCategory: 'housing',
              },
            ],
            carryovers: [],
          },
        })
      })
    )

    await expect(getDiagnosisContext('202601')).resolves.toEqual(
      expect.objectContaining({ targetMonth: '202601' })
    )
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'GET',
        pathname: '/ai-diagnoses/202601/context',
        authorization: `Bearer ${WORKER_TOKEN}`,
      })
    )
  })

  it('保存済み診断を検証し、未保存のnullを許可する', async () => {
    server.use(
      http.get(`${WORKER_URL}/ai-diagnoses/:month`, ({ params }) =>
        HttpResponse.json({
          data: params.month === '202601'
            ? {
                diagnosis: diagnosisView,
                inputHash: 'hash-1',
                analysisVersion: 'v1',
                updatedAt: '2026-01-20T12:00:00.000Z',
              }
            : null,
        })
      )
    )

    await expect(getSavedDiagnosis('202601')).resolves.toEqual(
      expect.objectContaining({ diagnosis: diagnosisView, inputHash: 'hash-1' })
    )
    await expect(getSavedDiagnosis('202602')).resolves.toBeNull()
  })

  it('診断リースを月別パスへJSON bodyで送る', async () => {
    server.use(
      http.post(`${WORKER_URL}/ai-diagnoses/:month/lease`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )

    await expect(acquireDiagnosisLease('202601', 'run-1')).resolves.toBeUndefined()
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'POST',
        pathname: '/ai-diagnoses/202601/lease',
        authorization: `Bearer ${WORKER_TOKEN}`,
        contentType: 'application/json',
        body: { runToken: 'run-1' },
      })
    )
  })

  it('expectedLabelを含む支出カテゴリ分類を送る', async () => {
    server.use(
      http.patch(`${WORKER_URL}/ai-diagnoses/categories`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )
    const assignments = [
      { expenseIds: ['expense-1'], category: 'housing' as const, expectedLabel: '家賃' },
    ]

    await expect(saveExpenseCategories(assignments)).resolves.toBeUndefined()
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        pathname: '/ai-diagnoses/categories',
        body: { assignments },
      })
    )
  })

  it('診断結果を月別パスへ保存してstrict検証済み結果を返す', async () => {
    server.use(
      http.put(`${WORKER_URL}/ai-diagnoses/:month`, async ({ request }) => {
        const body = await request.clone().json() as { diagnosis: unknown }
        await captureRequest(request)
        return HttpResponse.json({ data: body.diagnosis })
      })
    )
    const input = {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: diagnosisView,
    }

    await expect(saveDiagnosis('202601', input)).resolves.toEqual(diagnosisView)
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        pathname: '/ai-diagnoses/202601',
        body: input,
      })
    )
  })

  it('失敗経路の診断リース解放にDELETEとrunTokenを使う', async () => {
    server.use(
      http.delete(`${WORKER_URL}/ai-diagnoses/:month/lease`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )

    await expect(releaseDiagnosisLease('202601', 'run-1')).resolves.toBeUndefined()
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'DELETE',
        pathname: '/ai-diagnoses/202601/lease',
        body: { runToken: 'run-1' },
      })
    )
  })

  it('診断レスポンスへのperson混入と未知キーを502で拒否する', async () => {
    server.use(
      http.get(`${WORKER_URL}/ai-diagnoses/202601/context`, () =>
        HttpResponse.json({
          data: {
            targetMonth: '202601',
            incomes: [],
            expenses: [
              {
                id: 'expense-1',
                month: '202601',
                label: '家賃',
                amount: -120000,
                isCarryover: false,
                aiCategory: 'housing',
                person: 'husband',
              },
            ],
            carryovers: [],
          },
        })
      ),
      http.get(`${WORKER_URL}/ai-diagnoses/202602`, () =>
        HttpResponse.json({
          data: {
            diagnosis: { ...diagnosisView, month: '202602', person: 'wife' },
            inputHash: 'hash-2',
            analysisVersion: 'v1',
            updatedAt: '2026-02-20T12:00:00.000Z',
          },
        })
      )
    )

    await expect(getDiagnosisContext('202601')).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
    await expect(getSavedDiagnosis('202602')).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })

  it('保存入力へのperson混入を送信前に拒否する', async () => {
    const input = {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: { ...diagnosisView, person: 'husband' },
    } as unknown as Parameters<typeof saveDiagnosis>[1]

    await expect(saveDiagnosis('202601', input)).rejects.toBeDefined()
    expect(capturedRequests).toHaveLength(0)
  })

  it.each([
    ['リース競合', 'POST', '/ai-diagnoses/202601/lease'],
    ['分類競合', 'PATCH', '/ai-diagnoses/categories'],
  ])('%sを成功扱いしない', async (_name, method, path) => {
    server.use(
      http.all(`${WORKER_URL}${path}`, () =>
        HttpResponse.json({ error: '競合しました' }, { status: 409 })
      )
    )

    const operation = method === 'POST'
      ? acquireDiagnosisLease('202601', 'run-1')
      : saveExpenseCategories([
          { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '家賃' },
        ])
    await expect(operation).rejects.toEqual(new ApiError('競合しました', 409))
  })
})

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
      http.post(`${WORKER_URL}/sessions`, () =>
        HttpResponse.json({
          data: {
            token: 'session-token',
            person: 'husband',
            authMethod: 'passkey',
            expiresAt: '2026-03-01T00:00:00.000Z',
          },
        })
      ),
      http.get(`${WORKER_URL}/sessions/:token`, () => HttpResponse.json({ data: null }))
    )

    await expect(
      createSession({
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
      http.get(`${WORKER_URL}/sessions/:token`, () =>
        HttpResponse.json({ data: { token: 'broken-session' } })
      )
    )

    await expect(getSession('broken-session')).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })
})

describe('lib/api passkeys contract', () => {
  it('パスキーとチャレンジのレスポンスを検証し、未検出のnullを許可する', async () => {
    const passkey = {
      id: 'credential-1',
      person: 'wife' as const,
      publicKeyBase64: 'public-key',
      counter: 1,
      deviceName: null,
      transports: ['internal'],
      createdAt: '2026-03-01T00:00:00.000Z',
    }
    const challenge = {
      id: 'challenge-1',
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
      http.get(`${WORKER_URL}/webauthn-challenges/latest`, () =>
        HttpResponse.json({ data: null })
      )
    )

    await expect(listPasskeys('wife')).resolves.toEqual([passkey])
    await expect(
      createPasskey({
        id: passkey.id,
        person: passkey.person,
        publicKeyBase64: passkey.publicKeyBase64,
        counter: passkey.counter,
        deviceName: passkey.deviceName,
        transports: passkey.transports,
      })
    ).resolves.toEqual(passkey)
    await expect(getPasskey('missing')).resolves.toBeNull()
    await expect(
      createChallenge({
        challenge: challenge.challenge,
        type: challenge.type,
        person: challenge.person,
        expiresAt: challenge.expiresAt,
      })
    ).resolves.toEqual(challenge)
    await expect(
      getLatestChallenge({ type: 'authentication', person: null })
    ).resolves.toBeNull()
  })

  it('パスキー一覧の要素が契約外なら502を返す', async () => {
    server.use(
      http.get(`${WORKER_URL}/passkeys`, () =>
        HttpResponse.json({ data: [{ id: 'broken-passkey' }] })
      )
    )

    await expect(listPasskeys()).rejects.toEqual(
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
