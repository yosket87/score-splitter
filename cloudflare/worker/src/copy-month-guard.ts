import type { D1DatabaseLike } from './d1'
import { assertHouseholdContext, type HouseholdContext } from './households'

export interface CarryoverSnapshot {
  type: 'carryover' | 'expense'
  id: string
  label: string
  amount: number
  person: 'husband' | 'wife'
  flag: number
}

// 精算済みの行も含める。精算解除、追加、削除を同じ集合比較で検知する。
const carryoverRowsSql = `SELECT 'carryover' AS type, id, label, amount, person, is_cleared AS flag
 FROM carryovers WHERE household_id = ? AND month = ?
 UNION ALL SELECT 'expense' AS type, id, label, amount, person, is_carryover AS flag
 FROM expenses WHERE household_id = ? AND month = ? AND is_carryover = 1`

export async function loadCarryoverSnapshot(db: D1DatabaseLike, context: HouseholdContext, month: string) {
  assertHouseholdContext(context)
  return (await db.prepare(`${carryoverRowsSql} ORDER BY type, id`)
    .bind(context.householdId, month, context.householdId, month).all<CarryoverSnapshot>()).results
}
// locale依存の比較を避け、任意のIDでも実行環境によらない順序にする。
export function normalizeCarryoverSnapshot(rows: CarryoverSnapshot[]) {
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
  return JSON.stringify([...rows]
    .sort((a, b) => compare(a.type, b.type) || compare(a.id, b.id))
    .map(row => [row.type, row.id, row.label, row.amount, row.person, row.flag]))
}

export async function carryoverFingerprint(rows: CarryoverSnapshot[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(normalizeCarryoverSnapshot(rows))
  )
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

export function copyValidation(context: HouseholdContext, month: string, selectedItems: unknown[], snapshot: CarryoverSnapshot[] | null, fingerprintMatches: boolean) {
  assertHouseholdContext(context)
  const sql = `WITH selected AS (
  SELECT json_extract(value,'$.id') AS id, json_extract(value,'$.type') AS type,
   json_extract(value,'$.label') AS label, json_extract(value,'$.amount') AS amount,
   json_extract(value,'$.person') AS person, json_extract(value,'$.itemCopyMode') AS mode
  FROM json_each(?)
 ), source_rows AS (
  SELECT 'income' AS type, id, label, amount, person, 0 AS flag FROM incomes WHERE household_id = ? AND month = ?
  UNION ALL SELECT 'expense', id, label, amount, person, is_carryover FROM expenses WHERE household_id = ? AND month = ?
 ), carryover_rows AS (${carryoverRowsSql}), expected_carryover AS (
  SELECT json_extract(value,'$.type') AS type, json_extract(value,'$.id') AS id,
   json_extract(value,'$.label') AS label, json_extract(value,'$.amount') AS amount,
   json_extract(value,'$.person') AS person, json_extract(value,'$.flag') AS flag
  FROM json_each(?)
 ), validation AS (
  SELECT CASE
   WHEN EXISTS (SELECT 1 FROM selected s WHERE NOT EXISTS (SELECT 1 FROM source_rows r WHERE r.id=s.id AND r.type=s.type)) THEN 404
   WHEN EXISTS (SELECT 1 FROM selected s JOIN source_rows r ON r.id=s.id AND r.type=s.type
    WHERE r.label IS NOT s.label OR r.person IS NOT s.person OR r.flag != 0 OR (s.mode='withAmount' AND r.amount IS NOT s.amount)) THEN 409
   WHEN ? = 0 THEN 409
   WHEN ? = 1 AND (EXISTS (SELECT * FROM carryover_rows EXCEPT SELECT * FROM expected_carryover)
    OR EXISTS (SELECT * FROM expected_carryover EXCEPT SELECT * FROM carryover_rows)) THEN 409
   ELSE 200 END AS status
 )`
  const params = [JSON.stringify(selectedItems), context.householdId, month, context.householdId, month,
    context.householdId, month, context.householdId, month, JSON.stringify(snapshot ?? []), fingerprintMatches ? 1 : 0, snapshot === null ? 0 : 1]
  return { sql, params }
}
