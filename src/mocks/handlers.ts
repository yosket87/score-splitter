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
  http.post(`${WORKER_API_URL}/waitlist`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string
      priceIntent?: string
      simulatorUsed?: boolean
      website?: string
    }

    // honeypot: 成功を装い保存しない
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return HttpResponse.json({ data: { registered: true } }, { status: 201 })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const validIntent = body.priceIntent === 'free_only' || body.priceIntent === 'paid_ok'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validIntent) {
      return HttpResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
    }

    const table = getTable('waitlist_entries')
    if (!table.some((row) => row.email === email)) {
      table.push({
        id: `waitlist-${table.length + 1}`,
        email,
        price_intent: body.priceIntent,
        simulator_used: body.simulatorUsed ? 1 : 0,
        created_at: new Date().toISOString(),
      })
    }
    return HttpResponse.json({ data: { registered: true } }, { status: 201 })
  }),

  http.post(`${WORKER_API_URL}/login-attempts/check`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    return HttpResponse.json({ data: { allowed: true } })
  }),

  http.post(`${WORKER_API_URL}/login-attempts/failure`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    return HttpResponse.json({ data: { allowed: true } })
  }),

  http.post(`${WORKER_API_URL}/login-attempts/reset`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    return HttpResponse.json({ success: true })
  }),

  http.get(`${WORKER_API_URL}/copy-month/preview`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const url = new URL(request.url)
    const sourceMonth = url.searchParams.get('sourceMonth') ?? ''
    const targetMonth = url.searchParams.get('targetMonth') ?? ''
    return HttpResponse.json({
      data: buildCopyMonthPreview(sourceMonth, targetMonth),
    })
  }),

  http.get(`${WORKER_API_URL}/passkeys`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    const person = new URL(request.url).searchParams.get('person')
    const rows = person
      ? applyFilters([...getTable('passkey_credentials')], { person: `eq.${person}` })
      : [...getTable('passkey_credentials')]

    return HttpResponse.json({
      data: applyOrder(rows, 'created_at.asc').map(toApiPasskey),
    })
  }),

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

function toApiPasskey(row: Row) {
  return {
    id: row.id,
    person: row.person,
    publicKeyBase64: row.public_key_base64,
    counter: row.counter,
    deviceName: row.device_name ?? null,
    transports:
      typeof row.transports === 'string'
        ? (JSON.parse(row.transports) as string[])
        : (row.transports ?? []),
    createdAt: row.created_at,
  }
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
  const sourceMonth = String(body.sourceMonth ?? '')
  const targetMonth = String(body.targetMonth ?? '')
  const mode = body.mode === 'skip' || body.mode === 'replace' ? body.mode : 'add'
  const selectedItems = Array.isArray(body.selectedItems) ? body.selectedItems : []
  const includeCarryover = body.includeCarryover === true
  const result = {
    success: true,
    copied: {
      incomes: 0,
      expenses: 0,
      carryovers: 0,
    },
    skipped: { incomes: 0, expenses: 0, carryovers: 0 },
  }

  if (mode === 'replace') {
    if (selectedItems.some((item) => isSelectedCopyItem(item) && item.type === 'income')) {
      deleteRows('incomes', { month: `eq.${targetMonth}` })
    }
    if (selectedItems.some((item) => isSelectedCopyItem(item) && item.type === 'expense')) {
      deleteRows('expenses', { month: `eq.${targetMonth}` })
    }
    if (includeCarryover) {
      deleteRows('carryovers', { month: `eq.${targetMonth}` })
    }
  }

  const existingRecordKeys =
    mode === 'skip'
      ? {
          income: new Set(
            applyFilters([...getTable('incomes')], { month: `eq.${targetMonth}` }).map(
              getRecordCopyKey
            )
          ),
          expense: new Set(
            applyFilters([...getTable('expenses')], { month: `eq.${targetMonth}` }).map(
              getRecordCopyKey
            )
          ),
        }
      : null

  for (const item of selectedItems) {
    if (!isSelectedCopyItem(item)) continue

    const key = getRecordCopyKey(item)
    if (existingRecordKeys?.[item.type].has(key)) {
      if (item.type === 'income') result.skipped.incomes++
      else result.skipped.expenses++
      continue
    }

    const amount =
      item.itemCopyMode === 'labelOnly' ? (item.type === 'income' ? 1 : -1) : item.amount
    insertRows(item.type === 'income' ? 'incomes' : 'expenses', [
      {
        month: targetMonth,
        label: item.label,
        amount,
        person: item.person,
        ...(item.type === 'expense' ? { is_carryover: false } : {}),
      },
    ])
    if (item.type === 'income') result.copied.incomes++
    else result.copied.expenses++
  }

  if (includeCarryover) {
    const sourceCarryovers = applyFilters([...getTable('carryovers')], {
      month: `eq.${sourceMonth}`,
    }).filter((item) => item.is_cleared !== true)
    const carryoverExpenses = applyFilters([...getTable('expenses')], {
      month: `eq.${sourceMonth}`,
    }).filter((item) => item.is_carryover === true)
    const existingCarryoverKeys =
      mode === 'skip'
        ? new Set(
            applyFilters([...getTable('carryovers')], { month: `eq.${targetMonth}` }).map(
              getCarryoverCopyKey
            )
          )
        : new Set<string>()
    const insertingKeys = new Set<string>()

    for (const item of [...sourceCarryovers, ...carryoverExpenses]) {
      const key = getCarryoverCopyKey(item)
      if (existingCarryoverKeys.has(key) || insertingKeys.has(key)) {
        result.skipped.carryovers++
        continue
      }
      insertingKeys.add(key)
      insertRows('carryovers', [
        {
          month: targetMonth,
          label: item.label,
          amount: item.amount,
          person: item.person,
          is_cleared: false,
        },
      ])
      result.copied.carryovers++
    }
  }

  return result
}

function isSelectedCopyItem(item: unknown): item is {
  label: string
  amount: number
  person: 'husband' | 'wife'
  type: 'income' | 'expense'
  itemCopyMode: 'withAmount' | 'labelOnly'
} {
  if (!item || typeof item !== 'object') return false
  const row = item as Row
  return (
    typeof row.label === 'string' &&
    typeof row.amount === 'number' &&
    (row.person === 'husband' || row.person === 'wife') &&
    (row.type === 'income' || row.type === 'expense') &&
    (row.itemCopyMode === 'withAmount' || row.itemCopyMode === 'labelOnly')
  )
}

function getRecordCopyKey(item: unknown): string {
  const row = item as { label?: unknown; person?: unknown }
  return `${String(row.label ?? '')}|${String(row.person ?? '')}`
}

function getCarryoverCopyKey(item: unknown): string {
  const row = item as { amount?: unknown; label?: unknown; person?: unknown }
  return `${String(row.label ?? '')}|${String(row.amount ?? '')}|${String(row.person ?? '')}`
}

function buildCopyMonthPreview(sourceMonth: string, targetMonth: string) {
  const sourceIncomes = applyFilters([...getTable('incomes')], {
    month: `eq.${sourceMonth}`,
  })
  const sourceExpenses = applyFilters([...getTable('expenses')], {
    month: `eq.${sourceMonth}`,
  })
  const sourceCarryovers = applyFilters([...getTable('carryovers')], {
    month: `eq.${sourceMonth}`,
  })
  const targetCount =
    applyFilters([...getTable('incomes')], { month: `eq.${targetMonth}` }).length +
    applyFilters([...getTable('expenses')], { month: `eq.${targetMonth}` }).length +
    applyFilters([...getTable('carryovers')], { month: `eq.${targetMonth}` }).length
  const regularExpenses = sourceExpenses.filter((item) => item.is_carryover !== true)

  return {
    sourceMonth,
    targetMonth,
    items: [
      ...sourceIncomes.map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        person: item.person,
        type: 'income',
      })),
      ...regularExpenses.map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        person: item.person,
        type: 'expense',
      })),
    ],
    carryoverCount: sourceCarryovers.length + (sourceExpenses.length - regularExpenses.length),
    existingCount: targetCount,
  }
}
