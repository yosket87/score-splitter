/**
 * インメモリデータベースストア
 * Worker APIモック用のクエリ操作を提供する
 */

import { seedData } from './data'

type Row = Record<string, unknown>

interface Store {
  [table: string]: Row[]
}

// グローバルストア（サーバープロセス内で永続化）
let store: Store = {}

/** ストアをシードデータで初期化 */
export function initStore(): void {
  store = {
    incomes: structuredClone(seedData.incomes),
    expenses: structuredClone(seedData.expenses),
    carryovers: structuredClone(seedData.carryovers),
    sessions: [],
    passkey_credentials: structuredClone(seedData.passkey_credentials),
    webauthn_challenges: [],
  }
  console.log('[MSW] モックデータベースを初期化しました')
}

/** テーブルの全行を取得 */
export function getTable(table: string): Row[] {
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
      tableData[i] = {
        ...tableData[i],
        ...updates,
        updated_at: now,
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
  const tableData = getTable(table)
  const matching = applyFilters(tableData, filters)
  const matchingIds = new Set(matching.map((r) => r.id))

  const before = tableData.length
  store[table] = tableData.filter((r) => !matchingIds.has(r.id))
  return before - store[table].length
}
