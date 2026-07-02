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
  type: RecordType,
  month: string
) {
  const table = TABLE_BY_TYPE[type]
  const order =
    type === 'income'
      ? 'amount DESC, id ASC'
      : type === 'expense'
        ? 'amount ASC, id ASC'
        : 'created_at ASC, id ASC'
  const { results } = await db
    .prepare(`SELECT * FROM ${table} WHERE month = ? ORDER BY ${order}`)
    .bind(month)
    .all<RecordRow>()
  return results.map((row) => mapRecord(type, row))
}

export async function listMonthlyAmounts(db: D1DatabaseLike) {
  const [incomes, expenses] = await Promise.all([
    db.prepare('SELECT month, amount FROM incomes').all<{ month: string; amount: number }>(),
    db.prepare('SELECT month, amount FROM expenses').all<{ month: string; amount: number }>(),
  ])

  return {
    incomes: incomes.results,
    expenses: expenses.results,
  }
}

export async function createRecord(
  db: D1DatabaseLike,
  runtime: Runtime,
  type: RecordType,
  body: unknown
) {
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
        'INSERT INTO expenses (id, month, label, amount, person, is_carryover, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, month, label, amount, person, isCarryover ? 1 : 0, now, now)
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
        'INSERT INTO carryovers (id, month, label, amount, person, is_cleared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, month, label, amount, person, isCleared ? 1 : 0, now, now)
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
      'INSERT INTO incomes (id, month, label, amount, person, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, month, label, amount, person, now, now)
    .run()
  return { id, month, label, amount, person, createdAt: now }
}

export async function updateRecord(
  db: D1DatabaseLike,
  runtime: Runtime,
  type: RecordType,
  id: string,
  body: unknown
) {
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
        'UPDATE expenses SET label = ?, amount = ?, person = ?, is_carryover = ?, updated_at = ? WHERE id = ?'
      )
      .bind(label, amount, person, isCarryover ? 1 : 0, now, id)
      .run()
    const row = await getRecordRow(db, 'expenses', id)
    return mapExpense(row)
  }

  if (type === 'carryover') {
    const isCleared = parseBoolean(input.isCleared ?? false, 'isCleared')
    await db
      .prepare(
        'UPDATE carryovers SET label = ?, amount = ?, person = ?, is_cleared = ?, updated_at = ? WHERE id = ?'
      )
      .bind(label, amount, person, isCleared ? 1 : 0, now, id)
      .run()
    const row = await getRecordRow(db, 'carryovers', id)
    return mapCarryover(row)
  }

  await db
    .prepare('UPDATE incomes SET label = ?, amount = ?, person = ?, updated_at = ? WHERE id = ?')
    .bind(label, amount, person, now, id)
    .run()
  const row = await getRecordRow(db, 'incomes', id)
  return mapIncome(row)
}

export async function patchRecordFlag(
  db: D1DatabaseLike,
  runtime: Runtime,
  type: 'expense' | 'carryover',
  id: string,
  body: unknown
) {
  const input = assertObject(body)
  const now = runtime.now().toISOString()
  if (type === 'expense') {
    const isCarryover = parseBoolean(input.isCarryover, 'isCarryover')
    await db
      .prepare('UPDATE expenses SET is_carryover = ?, updated_at = ? WHERE id = ?')
      .bind(isCarryover ? 1 : 0, now, id)
      .run()
    return
  }

  const isCleared = parseBoolean(input.isCleared, 'isCleared')
  await db
    .prepare('UPDATE carryovers SET is_cleared = ?, updated_at = ? WHERE id = ?')
    .bind(isCleared ? 1 : 0, now, id)
    .run()
}

export async function deleteRecord(db: D1DatabaseLike, type: RecordType, id: string) {
  const table = TABLE_BY_TYPE[type]
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()
}

export function insertRecordStatement(
  db: D1DatabaseLike,
  runtime: Runtime,
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
  const id = runtime.randomUUID()
  const now = runtime.now().toISOString()
  if (type === 'expense') {
    return db
      .prepare(
        'INSERT INTO expenses (id, month, label, amount, person, is_carryover, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, item.month, item.label, item.amount, item.person, item.isCarryover ? 1 : 0, now, now)
  }
  if (type === 'carryover') {
    return db
      .prepare(
        'INSERT INTO carryovers (id, month, label, amount, person, is_cleared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, item.month, item.label, item.amount, item.person, item.isCleared ? 1 : 0, now, now)
  }
  return db
    .prepare(
      'INSERT INTO incomes (id, month, label, amount, person, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, item.month, item.label, item.amount, item.person, now, now)
}

async function getRecordRow(db: D1DatabaseLike, table: TableName, id: string): Promise<RecordRow> {
  const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<RecordRow>()
  if (!row) {
    throw new HttpError('データが見つかりません', 404)
  }
  return row
}
