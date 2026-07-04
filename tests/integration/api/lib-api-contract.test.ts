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
import type { CopyMonthOptions } from '@/types'

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
