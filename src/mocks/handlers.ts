/**
 * MSWハンドラー: Cloudflare Worker APIをインターセプト
 */

import { http, HttpResponse } from 'msw'
import {
  applyFilters,
  applyOrder,
  deleteRows,
  getTable,
  insertRows,
  updateRows,
} from './db'

const WORKER_API_URL =
  process.env.CLOUDFLARE_WORKER_API_URL || 'http://mock-worker.local'
const WORKER_API_TOKEN = process.env.CLOUDFLARE_WORKER_API_TOKEN || 'mock-worker-token'

type Row = Record<string, unknown>

export const handlers = [
  http.get(`${WORKER_API_URL}/:table`, ({ params, request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const table = params.table as string
    if (table === 'monthly-amounts') {
      return HttpResponse.json({
        data: {
          incomes: getTable('incomes').map(({ month, amount }) => ({ month, amount })),
          expenses: getTable('expenses').map(({ month, amount }) => ({ month, amount })),
        },
      })
    }
    if (!isRecordTable(table)) return notFound()

    const month = new URL(request.url).searchParams.get('month')
    const rows = applyOrder(
      month ? applyFilters([...getTable(table)], { month: `eq.${month}` }) : [...getTable(table)],
      orderForTable(table)
    )

    return HttpResponse.json({ data: rows.map((row) => toApiRecord(table, row)) })
  }),

  http.post(`${WORKER_API_URL}/:table`, async ({ params, request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const table = params.table as string
    const body = (await request.json()) as Row

    if (table === 'sessions') {
      const inserted = insertRows('sessions', [
        {
          token: body.token,
          person: body.person,
          auth_method: body.authMethod,
          expires_at: body.expiresAt,
        },
      ])[0]
      return HttpResponse.json({ data: toApiSession(inserted) }, { status: 201 })
    }

    if (table === 'copy-month') {
      return HttpResponse.json(copyMonth(body))
    }

    if (!isRecordTable(table)) return notFound()
    const inserted = insertRows(table, [toDbRecord(table, body)])[0]
    return HttpResponse.json({ data: toApiRecord(table, inserted) }, { status: 201 })
  }),

  http.patch(`${WORKER_API_URL}/:table/:id`, async ({ params, request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const table = params.table as string
    const id = params.id as string
    const body = (await request.json()) as Row

    if (table === 'passkeys') {
      updateRows('passkey_credentials', { id: `eq.${id}` }, { counter: body.counter })
      return HttpResponse.json({ success: true })
    }

    if (!isRecordTable(table)) return notFound()
    const updated = updateRows(table, { id: `eq.${id}` }, toDbRecord(table, body))
    return HttpResponse.json({ data: toApiRecord(table, updated[0]) })
  }),

  http.patch(`${WORKER_API_URL}/expenses/:id/carryover`, async ({ params, request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const body = (await request.json()) as { isCarryover: boolean }
    updateRows('expenses', { id: `eq.${params.id}` }, { is_carryover: body.isCarryover })
    return HttpResponse.json({ success: true })
  }),

  http.patch(`${WORKER_API_URL}/carryovers/:id/cleared`, async ({ params, request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const body = (await request.json()) as { isCleared: boolean }
    updateRows('carryovers', { id: `eq.${params.id}` }, { is_cleared: body.isCleared })
    return HttpResponse.json({ success: true })
  }),

  http.delete(`${WORKER_API_URL}/:table/:id`, ({ params, request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const table = params.table as string
    const id = params.id as string

    if (table === 'sessions') {
      deleteRows('sessions', { token: `eq.${id}` })
      return HttpResponse.json({ success: true })
    }

    if (!isRecordTable(table)) return notFound()
    deleteRows(table, { id: `eq.${id}` })
    return HttpResponse.json({ success: true })
  }),

  http.get(`${WORKER_API_URL}/sessions/:token`, ({ params, request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const token = params.token as string
    const row = applyFilters([...getTable('sessions')], { token: `eq.${token}` })[0]
    return HttpResponse.json({ data: row ? toApiSession(row) : null })
  }),
]

function isAuthorized(request: Request): boolean {
  return request.headers.get('authorization') === `Bearer ${WORKER_API_TOKEN}`
}

function unauthorized() {
  return HttpResponse.json({ error: '認証に失敗しました' }, { status: 401 })
}

function notFound() {
  return HttpResponse.json({ error: 'エンドポイントが見つかりません' }, { status: 404 })
}

function isRecordTable(table: string): table is 'incomes' | 'expenses' | 'carryovers' {
  return table === 'incomes' || table === 'expenses' || table === 'carryovers'
}

function orderForTable(table: 'incomes' | 'expenses' | 'carryovers'): string {
  if (table === 'incomes') return 'amount.desc'
  if (table === 'expenses') return 'amount.asc'
  return 'created_at.asc'
}

function toApiRecord(table: string, row: Row) {
  const base = {
    id: row.id,
    month: row.month,
    label: row.label,
    amount: row.amount,
    person: row.person,
    createdAt: row.created_at,
  }
  if (table === 'expenses') {
    return { ...base, isCarryover: row.is_carryover ?? false }
  }
  if (table === 'carryovers') {
    return { ...base, isCleared: row.is_cleared ?? false }
  }
  return base
}

function toDbRecord(table: string, row: Row) {
  const base = {
    month: row.month,
    label: row.label,
    amount: row.amount,
    person: row.person,
  }
  if (table === 'expenses') {
    return { ...base, is_carryover: row.isCarryover ?? false }
  }
  if (table === 'carryovers') {
    return { ...base, is_cleared: row.isCleared ?? false }
  }
  return base
}

function toApiSession(row: Row) {
  return {
    token: row.token,
    person: row.person,
    authMethod: row.auth_method,
    expiresAt: row.expires_at,
  }
}

function copyMonth(body: Row) {
  return {
    success: true,
    copied: {
      incomes: Array.isArray(body.selectedItems)
        ? body.selectedItems.filter((item: { type: string }) => item.type === 'income').length
        : 0,
      expenses: Array.isArray(body.selectedItems)
        ? body.selectedItems.filter((item: { type: string }) => item.type === 'expense').length
        : 0,
      carryovers: body.includeCarryover ? getTable('carryovers').length : 0,
    },
    skipped: { incomes: 0, expenses: 0, carryovers: 0 },
  }
}
