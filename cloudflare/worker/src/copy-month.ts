import type { D1DatabaseLike, D1PreparedStatementLike, Runtime } from './d1'
import { assertObject, parseBoolean, parseMonth, parsePerson, parseString } from './validation'
import { insertRecordStatement } from './records'

type CopyMode = 'add' | 'skip' | 'replace'
type ItemCopyMode = 'withAmount' | 'labelOnly'

interface SourceItem {
  id: string
  label: string
  amount: number
  person: 'husband' | 'wife'
  type: 'income' | 'expense'
  is_carryover?: number
}

interface CarryoverSourceItem {
  label: string
  amount: number
  person: 'husband' | 'wife'
  is_cleared?: number
}

interface SelectedCopyItem {
  id: string
  label: string
  amount: number
  person: 'husband' | 'wife'
  type: 'income' | 'expense'
  itemCopyMode: ItemCopyMode
}

export async function getCopyMonthPreview(
  db: D1DatabaseLike,
  sourceMonth: string,
  targetMonth: string
) {
  const [incomes, expenses, carryovers, targetIncomes, targetExpenses, targetCarryovers] =
    await Promise.all([
      db
        .prepare('SELECT id, label, amount, person FROM incomes WHERE month = ? ORDER BY amount DESC, id ASC')
        .bind(sourceMonth)
        .all<SourceItem>(),
      db
        .prepare(
          'SELECT id, label, amount, person, is_carryover FROM expenses WHERE month = ? ORDER BY amount ASC, id ASC'
        )
        .bind(sourceMonth)
        .all<SourceItem>(),
      db.prepare('SELECT id FROM carryovers WHERE month = ?').bind(sourceMonth).all<{ id: string }>(),
      db.prepare('SELECT id FROM incomes WHERE month = ?').bind(targetMonth).all<{ id: string }>(),
      db.prepare('SELECT id FROM expenses WHERE month = ?').bind(targetMonth).all<{ id: string }>(),
      db.prepare('SELECT id FROM carryovers WHERE month = ?').bind(targetMonth).all<{ id: string }>(),
    ])

  const regularExpenses = expenses.results.filter((item) => item.is_carryover !== 1)
  const carryoverExpenseCount = expenses.results.length - regularExpenses.length

  return {
    sourceMonth,
    targetMonth,
    items: [
      ...incomes.results.map((item) => ({ ...item, type: 'income' as const })),
      ...regularExpenses.map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        person: item.person,
        type: 'expense' as const,
      })),
    ],
    carryoverCount: carryovers.results.length + carryoverExpenseCount,
    existingCount:
      targetIncomes.results.length + targetExpenses.results.length + targetCarryovers.results.length,
  }
}

export async function copyMonthData(db: D1DatabaseLike, runtime: Runtime, body: unknown) {
  const input = assertObject(body)
  const targetMonth = parseMonth(input.targetMonth)
  const sourceMonth = parseMonth(input.sourceMonth)
  const mode = parseCopyMode(input.mode)
  const includeCarryover = parseBoolean(input.includeCarryover, 'includeCarryover')
  const selectedItems = parseSelectedItems(input.selectedItems)

  const result = {
    success: true,
    copied: { incomes: 0, expenses: 0, carryovers: 0 },
    skipped: { incomes: 0, expenses: 0, carryovers: 0 },
  }

  const statements: D1PreparedStatementLike[] = []

  if (mode === 'replace') {
    if (selectedItems.some((item) => item.type === 'income')) {
      statements.push(db.prepare('DELETE FROM incomes WHERE month = ?').bind(targetMonth))
    }
    if (selectedItems.some((item) => item.type === 'expense')) {
      statements.push(db.prepare('DELETE FROM expenses WHERE month = ?').bind(targetMonth))
    }
    if (includeCarryover) {
      statements.push(db.prepare('DELETE FROM carryovers WHERE month = ?').bind(targetMonth))
    }
  }

  const existing = mode === 'skip' ? await loadExistingKeys(db, targetMonth) : null

  for (const item of selectedItems) {
    const key = `${item.label}|${item.person}`
    if (existing?.[item.type].has(key)) {
      if (item.type === 'income') result.skipped.incomes++
      else result.skipped.expenses++
      continue
    }

    const amount =
      item.itemCopyMode === 'labelOnly' ? (item.type === 'income' ? 1 : -1) : item.amount
    statements.push(
      insertRecordStatement(db, runtime, item.type, {
        month: targetMonth,
        label: item.label,
        amount,
        person: item.person,
      })
    )
    if (item.type === 'income') result.copied.incomes++
    else result.copied.expenses++
  }

  if (includeCarryover) {
    const carryoverResult = await buildCarryoverStatements(
      db,
      runtime,
      sourceMonth,
      targetMonth,
      mode,
      statements
    )
    result.copied.carryovers = carryoverResult.copied
    result.skipped.carryovers = carryoverResult.skipped
  }

  if (statements.length > 0) {
    await db.batch(statements)
  }

  return result
}

async function loadExistingKeys(db: D1DatabaseLike, targetMonth: string) {
  const [incomes, expenses] = await Promise.all([
    db.prepare('SELECT label, person FROM incomes WHERE month = ?').bind(targetMonth).all<{
      label: string
      person: string
    }>(),
    db.prepare('SELECT label, person FROM expenses WHERE month = ?').bind(targetMonth).all<{
      label: string
      person: string
    }>(),
  ])

  return {
    income: new Set(incomes.results.map((item) => `${item.label}|${item.person}`)),
    expense: new Set(expenses.results.map((item) => `${item.label}|${item.person}`)),
  }
}

async function buildCarryoverStatements(
  db: D1DatabaseLike,
  runtime: Runtime,
  sourceMonth: string,
  targetMonth: string,
  mode: CopyMode,
  statements: D1PreparedStatementLike[]
) {
  const [carryovers, carryoverExpenses] = await Promise.all([
    db
      .prepare('SELECT label, amount, person, is_cleared FROM carryovers WHERE month = ?')
      .bind(sourceMonth)
      .all<CarryoverSourceItem>(),
    db
      .prepare('SELECT label, amount, person FROM expenses WHERE month = ? AND is_carryover = 1')
      .bind(sourceMonth)
      .all<CarryoverSourceItem>(),
  ])

  const existingKeys =
    mode === 'skip'
      ? new Set(
          (
            await db
              .prepare('SELECT label, person FROM carryovers WHERE month = ?')
              .bind(targetMonth)
              .all<{ label: string; person: string }>()
          ).results.map((item) => `${item.label}|${item.person}`)
        )
      : new Set<string>()

  let copied = 0
  let skipped = 0
  for (const item of [...carryovers.results, ...carryoverExpenses.results]) {
    if (item.is_cleared === 1) {
      skipped++
      continue
    }
    const key = `${item.label}|${item.person}`
    if (existingKeys.has(key)) {
      skipped++
      continue
    }
    statements.push(
      insertRecordStatement(db, runtime, 'carryover', {
        month: targetMonth,
        label: item.label,
        amount: item.amount,
        person: item.person,
      })
    )
    copied++
  }
  return { copied, skipped }
}

function parseCopyMode(value: unknown): CopyMode {
  if (value !== 'add' && value !== 'skip' && value !== 'replace') {
    throw new Error('modeが不正です')
  }
  return value
}

function parseSelectedItems(value: unknown): SelectedCopyItem[] {
  if (!Array.isArray(value)) {
    throw new Error('selectedItemsが不正です')
  }
  return value.map((item) => {
    const input = assertObject(item)
    const type = input.type === 'income' || input.type === 'expense' ? input.type : null
    const itemCopyMode =
      input.itemCopyMode === 'withAmount' || input.itemCopyMode === 'labelOnly'
        ? input.itemCopyMode
        : null
    if (!type || !itemCopyMode || !Number.isInteger(input.amount)) {
      throw new Error('selectedItemsが不正です')
    }
    return {
      id: parseString(input.id, 'id'),
      label: parseString(input.label, 'label'),
      amount: input.amount,
      person: parsePerson(input.person),
      type,
      itemCopyMode,
    }
  })
}
