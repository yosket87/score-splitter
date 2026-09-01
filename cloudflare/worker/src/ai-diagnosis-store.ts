import type { D1DatabaseLike, Runtime } from './d1'
import { AI_CATEGORY_SET } from '../../../src/features/ai-diagnosis/categories'
import {
  AI_DIAGNOSIS_DAILY_LIMIT,
  AI_DIAGNOSIS_GLOBAL_COOLDOWN_MS,
  AI_DIAGNOSIS_LEASE_DURATION_MS,
  AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES,
} from '../../../src/features/ai-diagnosis/limits'

const GLOBAL_GUARD_ID = 1
export const SOURCE_REVISION_CONFLICT_MESSAGE =
  '診断対象データが更新されたため保存できません'

export interface DiagnosisContextRow {
  targetMonth: string
  sourceRevision: number
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
  expectedSourceRevision: number
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

type ExecutionGuardD1Row = {
  run_token: string | null
  run_expires_at: string | null
  last_started_at: string | null
  usage_date: string
  daily_count: number
}

export type DiagnosisLeaseAcquireResult =
  | { acquired: true }
  | {
      acquired: false
      reason: 'busy' | 'cooldown' | 'daily_limit'
      retryAfterSeconds: number
    }

export async function getDiagnosisContext(
  db: D1DatabaseLike,
  targetMonth: string
): Promise<DiagnosisContextRow> {
  const months = getDiagnosisMonths(targetMonth)
  const placeholders = months.map(() => '?').join(', ')
  const [incomes, expenses, carryovers, revision] = await db.batch([
    db
      .prepare(`SELECT month, amount FROM incomes WHERE month IN (${placeholders})`)
      .bind(...months),
    db
      .prepare(
        `SELECT id, month, label, amount, is_carryover, ai_category FROM expenses WHERE month IN (${placeholders})`
      )
      .bind(...months),
    db
      .prepare(`SELECT month, amount, is_cleared FROM carryovers WHERE month IN (${placeholders})`)
      .bind(...months),
    db.prepare('SELECT revision FROM ai_diagnosis_source_revision WHERE id = 1'),
  ])
  const revisionRow = revision.results?.[0] as { revision?: unknown } | undefined
  const sourceRevision = revisionRow?.revision
  if (!Number.isSafeInteger(sourceRevision) || Number(sourceRevision) < 0) {
    throw new Error('診断source revisionが不正です')
  }

  return {
    targetMonth,
    sourceRevision: Number(sourceRevision),
    incomes: (incomes.results ?? []) as Array<{ month: string; amount: number }>,
    expenses: ((expenses.results ?? []) as ExpenseContextD1Row[]).map((row) => ({
      id: row.id,
      month: row.month,
      label: row.label,
      amount: row.amount,
      isCarryover: row.is_carryover === 1,
      aiCategory: row.ai_category ?? null,
    })),
    carryovers: ((carryovers.results ?? []) as CarryoverContextD1Row[]).map((row) => ({
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
): Promise<DiagnosisLeaseAcquireResult> {
  const now = runtime.now()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + AI_DIAGNOSIS_LEASE_DURATION_MS).toISOString()
  const cooldownCutoff = new Date(
    now.getTime() - AI_DIAGNOSIS_GLOBAL_COOLDOWN_MS
  ).toISOString()
  const usageDate = nowIso.slice(0, 10)

  await db
    .prepare(
      `INSERT OR IGNORE INTO ai_diagnoses
(id, month, result_json, input_hash, analysis_version, run_token, run_expires_at, created_at, updated_at)
VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`
    )
    .bind(runtime.randomUUID(), month, nowIso, nowIso)
    .run()

  const [guardResult, monthResult] = await db.batch([
    db
      .prepare(
        `UPDATE ai_execution_guard
SET run_token = ?, run_expires_at = ?, last_started_at = ?, usage_date = ?,
    daily_count = CASE WHEN usage_date = ? THEN daily_count + 1 ELSE 1 END,
    updated_at = ?
WHERE id = ?
  AND (run_token IS NULL OR run_expires_at < ?)
  AND (last_started_at IS NULL OR last_started_at <= ?)
  AND (usage_date <> ? OR daily_count < ?)
  AND EXISTS (
    SELECT 1 FROM ai_diagnoses
    WHERE month = ? AND (run_token IS NULL OR run_expires_at < ?)
  )`
      )
      .bind(
        token,
        expiresAt,
        nowIso,
        usageDate,
        usageDate,
        nowIso,
        GLOBAL_GUARD_ID,
        nowIso,
        cooldownCutoff,
        usageDate,
        AI_DIAGNOSIS_DAILY_LIMIT,
        month,
        nowIso
      ),
    db
      .prepare(
        `UPDATE ai_diagnoses
SET run_token = ?, run_expires_at = ?, updated_at = ?
WHERE month = ?
  AND (run_token IS NULL OR run_expires_at < ?)
  AND EXISTS (
    SELECT 1 FROM ai_execution_guard
    WHERE id = ? AND run_token = ? AND run_expires_at = ?
  )`
      )
      .bind(
        token,
        expiresAt,
        nowIso,
        month,
        nowIso,
        GLOBAL_GUARD_ID,
        token,
        expiresAt
      ),
  ])

  if (guardResult.meta?.changes === 1 && monthResult.meta?.changes === 1) {
    return { acquired: true }
  }

  if (guardResult.meta?.changes === 1) {
    await releaseGlobalGuard(db, token)
  }

  return getLeaseRejection(db, now, month)
}

export async function saveExpenseCategories(
  db: D1DatabaseLike,
  runtime: Runtime,
  month: string,
  runToken: string,
  assignments: StoreCategoryAssignment[]
): Promise<void> {
  const expenseCount = assignments.reduce(
    (count, assignment) => count + assignment.expenseIds.length,
    0
  )
  if (expenseCount > AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES) {
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
  const expenseIds = assignments.flatMap(({ expenseIds: ids }) => ids)
  if (new Set(expenseIds).size !== expenseIds.length) {
    throw new Error('支出IDが重複しています')
  }
  if (
    assignments.some(
      ({ expectedLabel }) => typeof expectedLabel !== 'string' || expectedLabel.length === 0
    )
  ) {
    throw new Error('期待ラベルが不正です')
  }

  if (expenseCount === 0) return
  const now = runtime.now().toISOString()
  const requestedJson = JSON.stringify(
    assignments.flatMap(({ expenseIds: ids, category, expectedLabel }) =>
      ids.map((expenseId) => ({ expenseId, category, expectedLabel }))
    )
  )
  const result = await db
    .prepare(
      `WITH requested AS (
  SELECT
    CAST(json_extract(value, '$.expenseId') AS TEXT) AS expense_id,
    CAST(json_extract(value, '$.category') AS TEXT) AS category,
    CAST(json_extract(value, '$.expectedLabel') AS TEXT) AS expected_label
  FROM json_each(?)
), ownership AS (
  SELECT 1
  FROM ai_diagnoses AS diagnosis
  JOIN ai_execution_guard AS guard
    ON guard.id = ? AND guard.run_token = diagnosis.run_token
  WHERE diagnosis.month = ?
    AND diagnosis.run_token = ?
    AND diagnosis.run_expires_at >= ?
    AND guard.run_expires_at >= ?
), eligible AS (
  SELECT COUNT(*) AS count
  FROM requested
  JOIN expenses
    ON expenses.id = requested.expense_id
   AND expenses.label = requested.expected_label
   AND expenses.ai_category IS NULL
)
UPDATE expenses
SET ai_category = (
      SELECT requested.category FROM requested WHERE requested.expense_id = expenses.id
    ),
    ai_category_source = 'ai',
    ai_categorized_at = ?,
    updated_at = ?
WHERE id IN (SELECT expense_id FROM requested)
  AND EXISTS (SELECT 1 FROM ownership)
  AND (SELECT count FROM eligible) = (SELECT COUNT(*) FROM requested)`
    )
    .bind(
      requestedJson,
      GLOBAL_GUARD_ID,
      month,
      runToken,
      now,
      now,
      now,
      now
    )
    .run()
  if (result.meta?.changes !== expenseCount) {
    throw new Error('分類中に支出が変更されました')
  }
}

async function getLeaseRejection(
  db: D1DatabaseLike,
  now: Date,
  month: string
): Promise<Exclude<DiagnosisLeaseAcquireResult, { acquired: true }>> {
  const nowIso = now.toISOString()
  const guard = await db
    .prepare(
      `SELECT run_token, run_expires_at, last_started_at, usage_date, daily_count
FROM ai_execution_guard WHERE id = ?`
    )
    .bind(GLOBAL_GUARD_ID)
    .first<ExecutionGuardD1Row>()

  if (
    guard?.run_token !== null &&
    guard?.run_token !== undefined &&
    guard.run_expires_at !== null &&
    guard.run_expires_at >= nowIso
  ) {
    return {
      acquired: false,
      reason: 'busy',
      retryAfterSeconds: secondsUntil(guard.run_expires_at, now),
    }
  }

  const usageDate = nowIso.slice(0, 10)
  if (guard?.usage_date === usageDate && guard.daily_count >= AI_DIAGNOSIS_DAILY_LIMIT) {
    const nextUtcDay = new Date(`${usageDate}T00:00:00.000Z`)
    nextUtcDay.setUTCDate(nextUtcDay.getUTCDate() + 1)
    return {
      acquired: false,
      reason: 'daily_limit',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((nextUtcDay.getTime() - now.getTime()) / 1000)
      ),
    }
  }

  if (guard?.last_started_at !== null && guard?.last_started_at !== undefined) {
    const cooldownEndsAt = new Date(
      new Date(guard.last_started_at).getTime() + AI_DIAGNOSIS_GLOBAL_COOLDOWN_MS
    )
    if (cooldownEndsAt.getTime() > now.getTime()) {
      return {
        acquired: false,
        reason: 'cooldown',
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / 1000)
        ),
      }
    }
  }

  const monthLease = await db
    .prepare(
      `SELECT run_token, run_expires_at FROM ai_diagnoses WHERE month = ?`
    )
    .bind(month)
    .first<{ run_token: string | null; run_expires_at: string | null }>()
  return {
    acquired: false,
    reason: 'busy',
    retryAfterSeconds:
      monthLease?.run_expires_at === null || monthLease?.run_expires_at === undefined
        ? 1
        : secondsUntil(monthLease.run_expires_at, now),
  }
}

function secondsUntil(isoDate: string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(isoDate).getTime() - now.getTime()) / 1000))
}

async function releaseGlobalGuard(db: D1DatabaseLike, token: string): Promise<void> {
  await db
    .prepare(
      `UPDATE ai_execution_guard
SET run_token = NULL, run_expires_at = NULL
WHERE id = ? AND run_token = ?`
    )
    .bind(GLOBAL_GUARD_ID, token)
    .run()
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
  const now = runtime.now().toISOString()
  const result = await db
    .prepare(
      `UPDATE ai_diagnoses
SET result_json = ?, input_hash = ?, analysis_version = ?,
    run_token = NULL, run_expires_at = NULL, updated_at = ?
WHERE month = ? AND run_token = ? AND run_expires_at >= ?
  AND EXISTS (
    SELECT 1 FROM ai_execution_guard
    WHERE id = ? AND run_token = ? AND run_expires_at >= ?
  )
  AND EXISTS (
    SELECT 1 FROM ai_diagnosis_source_revision
    WHERE id = ? AND revision = ?
  )`
    )
    .bind(
      JSON.stringify(input.diagnosis),
      input.inputHash,
      input.analysisVersion,
      now,
      month,
      input.runToken,
      now,
      GLOBAL_GUARD_ID,
      input.runToken,
      now,
      GLOBAL_GUARD_ID,
      input.expectedSourceRevision
    )
    .run()
  if (result.meta?.changes !== 1) {
    const revision = await db
      .prepare('SELECT revision FROM ai_diagnosis_source_revision WHERE id = ?')
      .bind(GLOBAL_GUARD_ID)
      .first<{ revision: number }>()
    if (revision && revision.revision !== input.expectedSourceRevision) {
      throw new Error(SOURCE_REVISION_CONFLICT_MESSAGE)
    }
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
