import type { D1DatabaseLike, Runtime } from './d1'
import { AI_CATEGORY_SET } from '../../../src/features/ai-diagnosis/categories'

const DIAGNOSIS_LEASE_DURATION_MS = 2 * 60 * 1000
const MAX_CATEGORY_EXPENSES = 100
const MAX_D1_BOUND_PARAMETERS = 100
const CATEGORY_FIXED_PARAMETER_COUNT = 4
const CATEGORY_IDS_PER_STATEMENT = MAX_D1_BOUND_PARAMETERS - CATEGORY_FIXED_PARAMETER_COUNT

export interface DiagnosisContextRow {
  targetMonth: string
  incomes: Array<{ month: string; amount: number }>
  expenses: Array<{
    id: string
    month: string
    label: string
    amount: number
    isCarryover: boolean
    aiCategory: string | null
  }>
  carryovers: Array<{ month: string; amount: number; isCleared: boolean }>
}

export interface StoreCategoryAssignment {
  expenseIds: string[]
  category: string
  expectedLabel: string
}

export interface SavedDiagnosisRow {
  diagnosis: unknown
  inputHash: string
  analysisVersion: string
  updatedAt: string
}

export interface StoreDiagnosisInput {
  runToken: string
  inputHash: string
  analysisVersion: string
  diagnosis: unknown
}

type SavedDiagnosisD1Row = {
  result_json: string | null
  input_hash: string | null
  analysis_version: string | null
  updated_at: string
}

type ExpenseContextD1Row = {
  id: string
  month: string
  label: string
  amount: number
  is_carryover: number
  ai_category: string | null
}

type CarryoverContextD1Row = {
  month: string
  amount: number
  is_cleared: number
}

export async function getDiagnosisContext(
  db: D1DatabaseLike,
  targetMonth: string
): Promise<DiagnosisContextRow> {
  const months = getDiagnosisMonths(targetMonth)
  const placeholders = months.map(() => '?').join(', ')
  const [incomes, expenses, carryovers] = await Promise.all([
    db
      .prepare(`SELECT month, amount FROM incomes WHERE month IN (${placeholders})`)
      .bind(...months)
      .all<{ month: string; amount: number }>(),
    db
      .prepare(
        `SELECT id, month, label, amount, is_carryover, ai_category FROM expenses WHERE month IN (${placeholders})`
      )
      .bind(...months)
      .all<ExpenseContextD1Row>(),
    db
      .prepare(`SELECT month, amount, is_cleared FROM carryovers WHERE month IN (${placeholders})`)
      .bind(...months)
      .all<CarryoverContextD1Row>(),
  ])

  return {
    targetMonth,
    incomes: incomes.results,
    expenses: expenses.results.map((row) => ({
      id: row.id,
      month: row.month,
      label: row.label,
      amount: row.amount,
      isCarryover: row.is_carryover === 1,
      aiCategory: row.ai_category ?? null,
    })),
    carryovers: carryovers.results.map((row) => ({
      month: row.month,
      amount: row.amount,
      isCleared: row.is_cleared === 1,
    })),
  }
}

export async function acquireDiagnosisLease(
  db: D1DatabaseLike,
  runtime: Runtime,
  month: string,
  token: string
): Promise<boolean> {
  const now = runtime.now()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + DIAGNOSIS_LEASE_DURATION_MS).toISOString()
  const updated = await db
    .prepare(
      `UPDATE ai_diagnoses
SET run_token = ?, run_expires_at = ?, updated_at = ?
WHERE month = ? AND (run_token IS NULL OR run_expires_at < ?)`
    )
    .bind(token, expiresAt, nowIso, month, nowIso)
    .run()
  if (updated.meta?.changes === 1) return true

  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO ai_diagnoses
(id, month, result_json, input_hash, analysis_version, run_token, run_expires_at, created_at, updated_at)
VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`
    )
    .bind(runtime.randomUUID(), month, token, expiresAt, nowIso, nowIso)
    .run()
  return inserted.meta?.changes === 1
}

export async function saveExpenseCategories(
  db: D1DatabaseLike,
  runtime: Runtime,
  assignments: StoreCategoryAssignment[]
): Promise<void> {
  const expenseCount = assignments.reduce(
    (count, assignment) => count + assignment.expenseIds.length,
    0
  )
  if (expenseCount > MAX_CATEGORY_EXPENSES) {
    throw new Error('一度に分類できる支出は100件までです')
  }
  if (assignments.some(({ category }) => !AI_CATEGORY_SET.has(category))) {
    throw new Error('許可されていない支出カテゴリです')
  }
  const hasInvalidExpenseId = assignments.some(({ expenseIds }) =>
    expenseIds.some((id) => typeof id !== 'string' || id.length === 0)
  )
  if (hasInvalidExpenseId) {
    throw new Error('支出IDが不正です')
  }
  if (
    assignments.some(
      ({ expectedLabel }) => typeof expectedLabel !== 'string' || expectedLabel.length === 0
    )
  ) {
    throw new Error('期待ラベルが不正です')
  }

  const now = runtime.now().toISOString()
  const statements = assignments.flatMap(({ expenseIds, category, expectedLabel }) =>
    chunk(expenseIds, CATEGORY_IDS_PER_STATEMENT).map((ids) => {
      const placeholders = ids.map(() => '?').join(', ')
      return db
        .prepare(
          `UPDATE expenses
SET ai_category = ?, ai_category_source = 'ai', ai_categorized_at = ?, updated_at = ?
WHERE id IN (${placeholders}) AND label = ?`
        )
        .bind(category, now, now, ...ids, expectedLabel)
    })
  )

  if (statements.length === 0) return
  const results = await db.batch(statements)
  const updatedExpenseCount = results.reduce(
    (count, result) => count + (result.meta?.changes ?? 0),
    0
  )
  if (updatedExpenseCount !== expenseCount) {
    throw new Error('分類中に支出が変更されました')
  }
}

export async function getSavedDiagnosis(
  db: D1DatabaseLike,
  month: string
): Promise<SavedDiagnosisRow | null> {
  const row = await db
    .prepare(
      `SELECT result_json, input_hash, analysis_version, updated_at
FROM ai_diagnoses WHERE month = ?`
    )
    .bind(month)
    .first<SavedDiagnosisD1Row>()
  if (!row || row.result_json === null) return null
  if (row.input_hash === null || row.analysis_version === null) {
    throw new Error('保存済み診断のメタデータが不正です')
  }

  return {
    diagnosis: JSON.parse(row.result_json) as unknown,
    inputHash: row.input_hash,
    analysisVersion: row.analysis_version,
    updatedAt: row.updated_at,
  }
}

export async function saveDiagnosis(
  db: D1DatabaseLike,
  runtime: Runtime,
  month: string,
  input: StoreDiagnosisInput
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE ai_diagnoses
SET result_json = ?, input_hash = ?, analysis_version = ?,
    run_token = NULL, run_expires_at = NULL, updated_at = ?
WHERE month = ? AND run_token = ?`
    )
    .bind(
      JSON.stringify(input.diagnosis),
      input.inputHash,
      input.analysisVersion,
      runtime.now().toISOString(),
      month,
      input.runToken
    )
    .run()
  if (result.meta?.changes !== 1) {
    throw new Error('診断リースが失効しているため保存できません')
  }
}

export async function releaseDiagnosisLease(
  db: D1DatabaseLike,
  month: string,
  token: string
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE ai_diagnoses
SET run_token = NULL, run_expires_at = NULL
WHERE month = ? AND run_token = ?`
    )
    .bind(month, token)
    .run()
  if (result.meta?.changes !== 1) {
    throw new Error('診断リースが失効しているため解放できません')
  }
}

function getDiagnosisMonths(targetMonth: string): string[] {
  if (!/^\d{6}$/.test(targetMonth)) throw new Error('対象月はYYYYMM形式で指定してください')
  const year = Number(targetMonth.slice(0, 4))
  const month = Number(targetMonth.slice(4, 6))
  if (month < 1 || month > 12) throw new Error('対象月はYYYYMM形式で指定してください')
  const targetMonthIndex = year * 12 + month - 1

  return Array.from({ length: 4 }, (_, offset) => {
    const monthIndex = targetMonthIndex - offset
    const calculatedYear = Math.floor(monthIndex / 12)
    const calculatedMonth = (monthIndex % 12) + 1
    return `${calculatedYear}${String(calculatedMonth).padStart(2, '0')}`
  })
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  )
}
