import { validateTableNames } from './backup-schema.mjs'

export const BACKUP_TABLES = Object.freeze([
  'incomes',
  'expenses',
  'carryovers',
  'sessions',
  'passkey_credentials',
  'webauthn_challenges',
  'login_attempts',
  'waitlist_entries',
])

function normalizeCounts(rows, tables = BACKUP_TABLES) {
  validateTableNames(tables)
  if (!Array.isArray(rows)) {
    throw new Error('テーブル件数が配列ではありません')
  }

  const counts = {}
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) {
      throw new Error('テーブル件数の行が不正です')
    }
    const tableName = row.table_name
    const rowCount = row.row_count
    if (
      !tables.includes(tableName) ||
      typeof rowCount !== 'number' ||
      !Number.isSafeInteger(rowCount) ||
      rowCount < 0 ||
      Object.hasOwn(counts, tableName)
    ) {
      throw new Error(`テーブル件数が不正です: ${String(tableName)}`)
    }
    counts[tableName] = rowCount
  }

  for (const tableName of tables) {
    if (!Object.hasOwn(counts, tableName)) {
      throw new Error(`テーブル件数が不足しています: ${tableName}`)
    }
  }

  return counts
}

export function normalizeRemoteCounts(value, tables = BACKUP_TABLES) {
  const executions = Array.isArray(value) ? value : [value]
  if (executions.length !== 1) {
    throw new Error('Wrangler D1 executeの結果件数が不正です')
  }
  const result = executions[0]
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Wrangler D1 execute結果がJSON objectではありません')
  }
  if (result.success !== true) {
    throw new Error('Wrangler D1 executeが成功していません')
  }
  return normalizeLocalCounts(result.results, tables)
}

export function normalizeLocalCounts(value, tables = BACKUP_TABLES) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error('テーブル件数の行数が不正です')
  }
  const row = value[0]
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new Error('テーブル件数の行が不正です')
  }
  if (Object.keys(row).some((tableName) => !tables.includes(tableName))) {
    throw new Error('テーブル件数に想定外の列が含まれています')
  }
  return normalizeCounts(
    tables.map((tableName) => ({
      table_name: tableName,
      row_count: Object.hasOwn(row, tableName) ? row[tableName] : undefined,
    })),
    tables
  )
}

export function verifyMatchingCounts(remoteCounts, localCounts, tables = BACKUP_TABLES) {
  for (const counts of [remoteCounts, localCounts]) {
    if (
      !counts || Object.keys(counts).length !== tables.length ||
      Object.keys(counts).some((name) => !tables.includes(name))
    ) {
      throw new Error('テーブル件数の対象集合が不一致です')
    }
  }
  const normalizedRemote = normalizeCounts(
    tables.map((tableName) => ({
      table_name: tableName,
      row_count: remoteCounts?.[tableName],
    })),
    tables
  )
  const normalizedLocal = normalizeCounts(
    tables.map((tableName) => ({
      table_name: tableName,
      row_count: localCounts?.[tableName],
    })),
    tables
  )

  for (const tableName of tables) {
    if (normalizedRemote[tableName] !== normalizedLocal[tableName]) {
      throw new Error(
        `${tableName}の件数が不一致です: remote=${String(normalizedRemote[tableName])}, restored=${String(normalizedLocal[tableName])}`
      )
    }
  }

  return normalizedRemote
}
