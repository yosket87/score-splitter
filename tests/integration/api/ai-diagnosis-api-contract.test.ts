import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { ApiError } from '@/lib/api/client'
import {
  acquireDiagnosisLease,
  getDiagnosisContext,
  getSavedDiagnosis,
  releaseDiagnosisLease,
  saveDiagnosis,
  saveExpenseCategories,
} from '@/lib/api/ai-diagnosis'

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

describe('lib/api ai-diagnosis contract', () => {
  it.each([
    ['context', '202613', () => getDiagnosisContext('202613')],
    ['saved', '202600', () => getSavedDiagnosis('202600')],
    ['acquire', '202613', () => acquireDiagnosisLease('202613', 'run-1')],
    ['save', '202600', () => saveDiagnosis('202600', {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: { ...diagnosisView, month: '202600' },
      expectedSourceRevision: 1,
    })],
    ['release', '202613', () => releaseDiagnosisLease('202613', 'run-1')],
  ])('実在しない月を%sクライアントからWorkerへ送信する前に拒否する', async (
    _operation,
    _month,
    operation
  ) => {
    server.use(
      http.all(new RegExp(`^${WORKER_URL}/ai-diagnoses/`), async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )

    await expect(operation()).rejects.toBeDefined()
    expect(capturedRequests).toHaveLength(0)
  })

  it('レスポンス中の実在しない月を502で拒否する', async () => {
    server.use(
      http.get(`${WORKER_URL}/ai-diagnoses/202601/context`, () =>
        HttpResponse.json({
          data: { targetMonth: '202613', incomes: [], expenses: [], carryovers: [] },
        })
      )
    )

    await expect(getDiagnosisContext('202601')).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })

  it('保存済み診断レスポンス中の実在しない月を502で拒否する', async () => {
    server.use(
      http.get(`${WORKER_URL}/ai-diagnoses/202601`, () =>
        HttpResponse.json({
          data: {
            diagnosis: { ...diagnosisView, month: '202600' },
            inputHash: 'hash-1',
            analysisVersion: 'v1',
            updatedAt: '2026-01-20T12:00:00.000Z',
          },
        })
      )
    )

    await expect(getSavedDiagnosis('202601')).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })

  it('診断コンテキストをBearer認証付き月別パスから取得する', async () => {
    server.use(
      http.get(`${WORKER_URL}/ai-diagnoses/:month/context`, ({ params, request }) => {
        captureRequest(request)
        return HttpResponse.json({
          data: {
            targetMonth: params.month,
            sourceRevision: 7,
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

    await expect(
      saveExpenseCategories('202601', 'run-1', assignments)
    ).resolves.toBeUndefined()
    expect(capturedRequests[0]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        pathname: '/ai-diagnoses/categories',
        body: { month: '202601', runToken: 'run-1', assignments },
      })
    )
  })

  it('支出カテゴリ分類101件をWorkerへ送信する前に拒否する', async () => {
    server.use(
      http.patch(`${WORKER_URL}/ai-diagnoses/categories`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )
    const assignments = [
      {
        expenseIds: Array.from({ length: 60 }, (_, index) => `expense-${index}`),
        category: 'housing' as const,
        expectedLabel: '家賃',
      },
      {
        expenseIds: Array.from({ length: 41 }, (_, index) => `expense-${index + 60}`),
        category: 'housing' as const,
        expectedLabel: '家賃',
      },
    ]

    await expect(
      saveExpenseCategories('202601', 'run-1', assignments)
    ).rejects.toBeDefined()
    expect(capturedRequests).toHaveLength(0)
  })

  it('支出カテゴリ分類100件をWorkerへ送信する', async () => {
    server.use(
      http.patch(`${WORKER_URL}/ai-diagnoses/categories`, async ({ request }) => {
        await captureRequest(request)
        return HttpResponse.json({ success: true })
      })
    )
    const assignments = [
      {
        expenseIds: Array.from({ length: 60 }, (_, index) => `expense-${index}`),
        category: 'housing' as const,
        expectedLabel: '家賃',
      },
      {
        expenseIds: Array.from({ length: 40 }, (_, index) => `expense-${index + 60}`),
        category: 'housing' as const,
        expectedLabel: '家賃',
      },
    ]

    await expect(
      saveExpenseCategories('202601', 'run-1', assignments)
    ).resolves.toBeUndefined()
    expect(capturedRequests[0]?.body).toEqual({
      month: '202601',
      runToken: 'run-1',
      assignments,
    })
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
      expectedSourceRevision: 7,
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
            sourceRevision: 7,
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
      expectedSourceRevision: 7,
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
      : saveExpenseCategories('202601', 'run-1', [
          { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '家賃' },
        ])
    await expect(operation).rejects.toEqual(new ApiError('競合しました', 409))
  })

  it('source revision競合の専用409を保持する', async () => {
    server.use(
      http.put(`${WORKER_URL}/ai-diagnoses/202601`, () =>
        HttpResponse.json(
          { error: '診断対象データが更新されたため保存できません' },
          { status: 409 }
        )
      )
    )

    await expect(
      saveDiagnosis('202601', {
        runToken: 'run-1',
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        expectedSourceRevision: 7,
        diagnosis: diagnosisView,
      })
    ).rejects.toEqual(
      new ApiError('診断対象データが更新されたため保存できません', 409)
    )
  })
})
