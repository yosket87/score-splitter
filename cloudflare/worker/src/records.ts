import { assertHouseholdContext, type HouseholdContext } from './households'
import type { D1DatabaseLike, D1PreparedStatementLike, Runtime } from './d1'
import { HttpError } from './http'
import {
  assertObject,
  assertRecordAmount,
  parseBoolean,
  parseInteger,
  parseMonth,
  parsePerson,
  parseString,
  type Person,
  type RecordType,
} from './validation'

export interface BaseRecord {
  id: string
  month: string
  label: string
  amount: number
  person: Person
  createdAt: string
}

export interface ExpenseRecord extends BaseRecord {
  isCarryover: boolean
}

export interface CarryoverRecord extends BaseRecord {
  isCleared: boolean
}

type TableName = 'incomes' | 'expenses' | 'carryovers'
type RecordRow = {
  id: string
  month: string
  label: string
  amount: number
  person: Person
  is_carryover?: number
  is_cleared?: number
  created_at: string
  updated_at: string
}

const TABLE_BY_TYPE: Record<RecordType, TableName> = {
  income: 'incomes',
  expense: 'expenses',
  carryover: 'carryovers',
}

export function mapIncome(row: RecordRow): BaseRecord {
  return {
    id: row.id,
    month: row.month,
    label: row.label,
    amount: row.amount,
    person: row.person,
    createdAt: row.created_at,
  }
}

export function mapExpense(row: RecordRow): ExpenseRecord {
  return {
    ...mapIncome(row),
    isCarryover: row.is_carryover === 1,
  }
}

export function mapCarryover(row: RecordRow): CarryoverRecord {
  return {
    ...mapIncome(row),
    isCleared: row.is_cleared === 1,
  }
}

export function mapRecord(type: RecordType, row: RecordRow) {
  if (type === 'expense') return mapExpense(row)
  if (type === 'carryover') return mapCarryover(row)
  return mapIncome(row)
}

export async function listRecordsByMonth(
  db: D1DatabaseLike,
  context: HouseholdContext,
  type: RecordType,
  month: string
) {
  assertHouseholdContext(context)
  const table = TABLE_BY_TYPE[type]
  const order =
    type === 'income'
      ? 'amount DESC, id ASC'
      : type === 'expense'
        ? 'amount ASC, id ASC'
        : 'created_at ASC, id ASC'
  const { results } = await db
    .prepare(`SELECT * FROM ${table} WHERE household_id = ? AND month = ? ORDER BY ${order}`)
    .bind(context.householdId, month)
    .all<RecordRow>()
  return results.map((row) => mapRecord(type, row))
}

export async function listMonthlyAmounts(db: D1DatabaseLike, context: HouseholdContext) {
  assertHouseholdContext(context)
  const [incomes, expenses] = await Promise.all([
    db.prepare('SELECT month, amount FROM incomes WHERE household_id = ?').bind(context.householdId).all<{ month: string; amount: number }>(),
    db.prepare('SELECT month, amount FROM expenses WHERE household_id = ?').bind(context.householdId).all<{ month: string; amount: number }>(),
  ])

  return {
    incomes: incomes.results,
    expenses: expenses.results,
  }
}

export async function createRecord(
  db: D1DatabaseLike,
  runtime: Runtime,
  context: HouseholdContext,
  type: RecordType,
  body: unknown
) {
  assertHouseholdContext(context)
  const input = assertObject(body)
  const id = runtime.randomUUID()
  const now = runtime.now().toISOString()
  const month = parseMonth(input.month)
  const label = parseString(input.label, 'label')
  const amount = parseInteger(input.amount, 'amount')
  const person = parsePerson(input.person)
  assertRecordAmount(type, amount)

  if (type === 'expense') {
    const isCarryover = parseBoolean(input.isCarryover ?? false, 'isCarryover')
    await db
      .prepare(
        'INSERT INTO expenses (household_id, id, month, label, amount, person, is_carryover, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(context.householdId, id, month, label, amount, person, isCarryover ? 1 : 0, now, now)
      .run()
    return {
      id,
      month,
      label,
      amount,
      person,
      isCarryover,
      createdAt: now,
    }
  }

  if (type === 'carryover') {
    const isCleared = parseBoolean(input.isCleared ?? false, 'isCleared')
    await db
      .prepare(
        'INSERT INTO carryovers (household_id, id, month, label, amount, person, is_cleared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(context.householdId, id, month, label, amount, person, isCleared ? 1 : 0, now, now)
      .run()
    return {
      id,
      month,
      label,
      amount,
      person,
      isCleared,
      createdAt: now,
    }
  }

  await db
    .prepare(
      'INSERT INTO incomes (household_id, id, month, label, amount, person, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(context.householdId, id, month, label, amount, person, now, now)
    .run()
  return { id, month, label, amount, person, createdAt: now }
}

export async function updateRecord(
  db: D1DatabaseLike,
  runtime: Runtime,
  context: HouseholdContext,
  type: RecordType,
  id: string,
  body: unknown
) {
  assertHouseholdContext(context)
  const input = assertObject(body)
  const now = runtime.now().toISOString()
  const label = parseString(input.label, 'label')
  const amount = parseInteger(input.amount, 'amount')
  const person = parsePerson(input.person)
  assertRecordAmount(type, amount)

  if (type === 'expense') {
    const isCarryover = parseBoolean(input.isCarryover ?? false, 'isCarryover')
    await db
      .prepare(
        `UPDATE expenses SET
ai_category = CASE WHEN label = ? THEN ai_category ELSE NULL END,
ai_category_source = CASE WHEN label = ? THEN ai_category_source ELSE NULL END,
ai_categorized_at = CASE WHEN label = ? THEN ai_categorized_at ELSE NULL END,
label = ?, amount = ?, person = ?, is_carryover = ?, updated_at = ?
WHERE id = ? AND household_id = ?`
      )
      .bind(label, label, label, label, amount, person, isCarryover ? 1 : 0, now, id, context.householdId)
      .run()
    const row = await getRecordRow(db, context, 'expenses', id)
    return mapExpense(row)
  }

  if (type === 'carryover') {
    const isCleared = parseBoolean(input.isCleared ?? false, 'isCleared')
    await db
      .prepare(
        'UPDATE carryovers SET label = ?, amount = ?, person = ?, is_cleared = ?, updated_at = ? WHERE id = ? AND household_id = ?'
      )
      .bind(label, amount, person, isCleared ? 1 : 0, now, id, context.householdId)
      .run()
    const row = await getRecordRow(db, context, 'carryovers', id)
    return mapCarryover(row)
  }

  await db
    .prepare('UPDATE incomes SET label = ?, amount = ?, person = ?, updated_at = ? WHERE id = ? AND household_id = ?')
    .bind(label, amount, person, now, id, context.householdId)
    .run()
  const row = await getRecordRow(db, context, 'incomes', id)
  return mapIncome(row)
}

export async function patchRecordFlag(
  db: D1DatabaseLike,
  runtime: Runtime,
  context: HouseholdContext,
  type: 'expense' | 'carryover',
  id: string,
  body: unknown
) {
  assertHouseholdContext(context)
  const input = assertObject(body)
  const now = runtime.now().toISOString()
  if (type === 'expense') {
    const isCarryover = parseBoolean(input.isCarryover, 'isCarryover')
    const result = await db
      .prepare('UPDATE expenses SET is_carryover = ?, updated_at = ? WHERE id = ? AND household_id = ?')
      .bind(isCarryover ? 1 : 0, now, id, context.householdId)
      .run()
    assertChanged(result)
    return
  }

  const isCleared = parseBoolean(input.isCleared, 'isCleared')
  const result = await db
    .prepare('UPDATE carryovers SET is_cleared = ?, updated_at = ? WHERE id = ? AND household_id = ?')
    .bind(isCleared ? 1 : 0, now, id, context.householdId)
    .run()
  assertChanged(result)
}

export async function deleteRecord(db: D1DatabaseLike, context: HouseholdContext, type: RecordType, id: string) {
  assertHouseholdContext(context)
  const table = TABLE_BY_TYPE[type]
  const result = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND household_id = ?`).bind(id, context.householdId).run()
  assertChanged(result)
}

export function insertRecordStatement(
  db: D1DatabaseLike,
  runtime: Runtime,
  context: HouseholdContext,
  type: RecordType,
  item: {
    month: string
    label: string
    amount: number
    person: Person
    isCarryover?: boolean
    isCleared?: boolean
  }
): D1PreparedStatementLike {
  assertHouseholdContext(context)
  const id = runtime.randomUUID()
  const now = runtime.now().toISOString()
  if (type === 'expense') {
    return db
      .prepare(
        'INSERT INTO expenses (household_id, id, month, label, amount, person, is_carryover, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(context.householdId, id, item.month, item.label, item.amount, item.person, item.isCarryover ? 1 : 0, now, now)
  }
  if (type === 'carryover') {
    return db
      .prepare(
        'INSERT INTO carryovers (household_id, id, month, label, amount, person, is_cleared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(context.householdId, id, item.month, item.label, item.amount, item.person, item.isCleared ? 1 : 0, now, now)
  }
  return db
    .prepare(
      'INSERT INTO incomes (household_id, id, month, label, amount, person, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(context.householdId, id, item.month, item.label, item.amount, item.person, now, now)
}

async function getRecordRow(db: D1DatabaseLike, context: HouseholdContext, table: TableName, id: string): Promise<RecordRow> {
  assertHouseholdContext(context)
  const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND household_id = ?`).bind(id, context.householdId).first<RecordRow>()
  if (!row) {
    throw new HttpError('データが見つかりません', 404)
  }
  return row
}

function assertChanged(result: { meta?: { changes?: number } }) {
  if (!result.meta?.changes) throw new HttpError('データが見つかりません', 404)
}
