/**
 * インメモリデータベースストア
 * Worker APIモック用のクエリ操作を提供する
 */

import { seedData } from './data'

type Row = Record<string, unknown>

interface Store {
  [table: string]: Row[]
}

const REVISION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  incomes: ['month', 'amount'],
  expenses: ['month', 'label', 'amount', 'is_carryover'],
  carryovers: ['month', 'amount', 'is_cleared'],
}

// instrumentationとRoute Handlerの別バンドル間でも同じストアを共有する。
const mockGlobal = globalThis as typeof globalThis & {
  __scoreSplitterMockStore?: Store
}

function getStore(): Store {
  return (mockGlobal.__scoreSplitterMockStore ??= {})
}

/** ストアをシードデータで初期化 */
export function initStore(): void {
  mockGlobal.__scoreSplitterMockStore = {
    incomes: structuredClone(seedData.incomes).map(row => ({...row, household_id:'3975b870-bbfa-49fd-ae3d-d273c9f6e107'})),
    expenses: structuredClone(seedData.expenses).map(row => ({...row, household_id:'3975b870-bbfa-49fd-ae3d-d273c9f6e107'})),
    carryovers: structuredClone(seedData.carryovers).map(row => ({...row, household_id:'3975b870-bbfa-49fd-ae3d-d273c9f6e107'})),
    households: [{ id: '3975b870-bbfa-49fd-ae3d-d273c9f6e107', legacy_auth_key: 'legacy', created_at: '2026-09-05T00:00:00.000Z' }],
    sessions: [],
    passkey_credentials: structuredClone(seedData.passkey_credentials),
    webauthn_challenges: [],
    waitlist_entries: [],
    ai_diagnoses: [],
    ai_execution_guard: [
      {
        id: 1,
        run_token: null,
        run_expires_at: null,
        last_started_at: null,
        usage_date: '1970-01-01',
        daily_count: 0,
        updated_at: '1970-01-01T00:00:00.000Z',
      },
    ],
    ai_diagnosis_source_revision: [
      { id: 1, revision: 0, updated_at: '1970-01-01T00:00:00.000Z' },
    ],
  }
}

/** テーブルの全行を取得 */
export function getTable(table: string): Row[] {
  const store = getStore()
  if (!store[table]) {
    store[table] = []
  }
  return store[table]
}

/**
 * `column=operator.value`形式のフィルタを適用
 * 例: { month: 'eq.202602', person: 'eq.husband' }
 */
export function applyFilters(rows: Row[], filters: Record<string, string>): Row[] {
  let result = rows
  for (const [column, filterValue] of Object.entries(filters)) {
    const dotIndex = filterValue.indexOf('.')
    if (dotIndex === -1) continue

    const operator = filterValue.substring(0, dotIndex)
    const value = filterValue.substring(dotIndex + 1)

    result = result.filter((row) => {
      const rowValue = String(row[column] ?? '')
      switch (operator) {
        case 'eq':
          return rowValue === value
        case 'neq':
          return rowValue !== value
        case 'gt':
          return Number(rowValue) > Number(value)
        case 'gte':
          return Number(rowValue) >= Number(value)
        case 'lt':
          return Number(rowValue) < Number(value)
        case 'lte':
          return Number(rowValue) <= Number(value)
        default:
          return true
      }
    })
  }
  return result
}

/**
 * `column.direction`形式のorder句を適用
 * 例: 'created_at.asc' or 'amount.desc'
 */
export function applyOrder(rows: Row[], orderParam: string): Row[] {
  const sorted = [...rows]
  const parts = orderParam.split('.')
  const column = parts[0]
  const direction = parts[1] ?? 'asc'

  sorted.sort((a, b) => {
    const aVal = a[column]
    const bVal = b[column]

    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1

    let cmp: number
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal
    } else {
      cmp = String(aVal).localeCompare(String(bVal))
    }

    return direction === 'desc' ? -cmp : cmp
  })

  return sorted
}

/**
 * select句で指定されたカラムのみ返す
 * 例: 'id,label,amount,person' or '*'
 */
export function applySelect(rows: Row[], selectParam: string): Row[] {
  if (selectParam === '*' || !selectParam) {
    return rows
  }

  const columns = selectParam.split(',').map((c) => c.trim())
  return rows.map((row) => {
    const filtered: Row = {}
    for (const col of columns) {
      if (col in row) {
        filtered[col] = row[col]
      }
    }
    return filtered
  })
}

/** 行を挿入 */
export function insertRows(table: string, rows: Row[]): Row[] {
  const tableData = getTable(table)
  const now = new Date().toISOString()

  const inserted = rows.map((row) => ({
    ...row,
    id: row.id ?? crypto.randomUUID(),
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  }))

  tableData.push(...inserted)
  for (const row of inserted) trackPaymentRevision(table, row)
  incrementSourceRevision(table, inserted.length)
  return inserted
}

/** フィルタに一致する行を更新 */
export function updateRows(
  table: string,
  filters: Record<string, string>,
  updates: Row
): Row[] {
  const tableData = getTable(table)
  const now = new Date().toISOString()
  const updated: Row[] = []

  const matching = applyFilters(tableData, filters)
  const matchingIds = new Set(matching.map((r) => r.id))

  for (let i = 0; i < tableData.length; i++) {
    if (matchingIds.has(tableData[i].id)) {
      const before = tableData[i]
      tableData[i] = {
        ...tableData[i],
        ...updates,
        updated_at: now,
      }
      const paymentFields = ['month', 'label', 'amount', 'person', 'is_carryover', 'is_cleared', 'created_at']
      if (paymentFields.some((field) => before[field] !== tableData[i][field])) {
        trackPaymentRevision(table, before)
        if (before.month !== tableData[i].month) trackPaymentRevision(table, tableData[i])
      }
      const fields = REVISION_FIELDS[table] ?? []
      if (fields.some((field) => before[field] !== tableData[i][field])) {
        incrementSourceRevision(table, 1)
      }
      updated.push(tableData[i])
    }
  }

  return updated
}

/** フィルタに一致する行を削除 */
export function deleteRows(
  table: string,
  filters: Record<string, string>
): number {
  const store = getStore()
  const tableData = getTable(table)
  const matching = applyFilters(tableData, filters)
  const matchingIds = new Set(matching.map((r) => r.id))

  const before = tableData.length
  store[table] = tableData.filter((r) => !matchingIds.has(r.id))
  for (const row of matching) trackPaymentRevision(table, row)
  const deleted = before - store[table].length
  incrementSourceRevision(table, deleted)
  return deleted
}

function incrementSourceRevision(table: string, count: number): void {
  if (!(table in REVISION_FIELDS) || count === 0) return
  const row = getTable('ai_diagnosis_source_revision')[0]
  if (!row) throw new Error('診断source revisionが初期化されていません')
  row.revision = Number(row.revision) + count
  row.updated_at = new Date().toISOString()
}

export function incrementPaymentRevision(month: string): void {
  const rows = getTable('month_payment_revisions')
  const index = rows.findIndex((row) => row.month === month)
  if (index < 0) rows.push({ month, revision: 1 })
  else rows[index] = { ...rows[index], revision: Number(rows[index].revision) + 1 }
}

function trackPaymentRevision(table: string, row: Row): void {
  if (table in REVISION_FIELDS) incrementPaymentRevision(String(row.month))
}
