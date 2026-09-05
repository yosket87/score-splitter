import type { D1DatabaseLike, D1PreparedStatementLike, Runtime } from './d1'
import { HttpError } from './http'
import { assertHouseholdContext, type HouseholdContext } from './households'
import {
  assertRecordAmount, assertObject, parseBoolean, parseInteger,
  parseMonth, parsePerson, parseString,
} from './validation'
import { carryoverFingerprint, copyValidation, loadCarryoverSnapshot } from './copy-month-guard'
import { listRecordsByMonth } from './records'

type CopyMode = 'add' | 'skip' | 'replace'
type ItemCopyMode = 'withAmount' | 'labelOnly'
type CopyTable = 'incomes' | 'expenses' | 'carryovers'
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
  context: HouseholdContext,
  sourceMonth: string,
  targetMonth: string
) {
  assertHouseholdContext(context)
  parseMonth(sourceMonth)
  parseMonth(targetMonth)
  const [incomes, expenses, snapshot, ...targets] = await Promise.all([
    listRecordsByMonth(db, context, 'income', sourceMonth),
    listRecordsByMonth(db, context, 'expense', sourceMonth),
    loadCarryoverSnapshot(db, context, sourceMonth),
    ...(['income', 'expense', 'carryover'] as const).map(type =>
      listRecordsByMonth(db, context, type, targetMonth)
    ),
  ])
  const items = [
    ...incomes.map(({ id, label, amount, person }) => ({
      id, label, amount, person, type: 'income' as const,
    })),
    ...expenses.filter(item => !('isCarryover' in item) || !item.isCarryover)
      .map(({ id, label, amount, person }) => ({
        id, label, amount, person, type: 'expense' as const,
      })),
  ]
  return {
    sourceMonth,
    targetMonth,
    items,
    carryoverCount: snapshot.length,
    carryoverFingerprint: await carryoverFingerprint(snapshot),
    existingCount: targets.reduce((sum, rows) => sum + rows.length, 0),
  }
}

export async function copyMonthData(
  db: D1DatabaseLike,
  runtime: Runtime,
  context: HouseholdContext,
  body: unknown
) {
  assertHouseholdContext(context)
  const input = assertObject(body)
  const targetMonth = parseMonth(input.targetMonth)
  const sourceMonth = parseMonth(input.sourceMonth)
  if (sourceMonth === targetMonth) throw new HttpError('同じ月にはコピーできません', 400)
  const mode = parseCopyMode(input.mode)
  const includeCarryover = parseBoolean(input.includeCarryover, 'includeCarryover')
  const selectedItems = parseSelectedItems(input.selectedItems)
  const snapshot = includeCarryover ? await loadCarryoverSnapshot(db, context, sourceMonth) : null
  const fingerprintMatches = snapshot === null || (
    typeof input.carryoverFingerprint === 'string' &&
    await carryoverFingerprint(snapshot) === input.carryoverFingerprint
  )
  const guard = copyValidation(context, sourceMonth, selectedItems, snapshot, fingerprintMatches)
  const guarded = (sql: string, ...params: unknown[]) =>
    db.prepare(`${guard.sql} ${sql}`).bind(...guard.params, ...params)

  // 全ガードはコピー元だけを参照し、コピー先の更新やrevisionトリガーでは変化しない。
  const statements: D1PreparedStatementLike[] = [guarded('SELECT status FROM validation')]
  const mutations: Array<{ index: number; type: CopyTable }> = []
  const result = {
    success: true,
    copied: { incomes: 0, expenses: 0, carryovers: 0 },
    skipped: { incomes: 0, expenses: 0, carryovers: 0 },
  }
  if (mode === 'replace') {
    for (const [type, table] of [
      ['income', 'incomes'], ['expense', 'expenses'], ['carryover', 'carryovers'],
    ] as const) {
      if (type === 'carryover' ? includeCarryover : selectedItems.some(item => item.type === type)) {
        statements.push(guarded(
          `DELETE FROM ${table} WHERE household_id=? AND month=? AND (SELECT status FROM validation)=200`,
          context.householdId, targetMonth
        ))
      }
    }
  }

  // 通常項目のskipは、入力中の同キー項目を従来どおり別々にコピーする。
  // 今回発行するIDを既存判定から除外し、事前読取後からbatch開始前のコピー先変更は反映する。
  const selectedIds = selectedItems.map(() => runtime.randomUUID())
  const insert = (
    table: CopyTable,
    item: { label: string; amount: number; person: string },
    skip: boolean,
    id: string
  ) => {
    const flag = table === 'incomes' ? '' : table === 'expenses' ? ',is_carryover' : ',is_cleared'
    const duplicateCondition = table === 'carryovers'
      ? ' AND amount=?'
      : ' AND id NOT IN (SELECT value FROM json_each(?))'
    const exists = skip
      ? ` AND NOT EXISTS (SELECT 1 FROM ${table} WHERE household_id=? AND month=? AND label=? AND person=?${duplicateCondition})`
      : ''
    const now = runtime.now().toISOString()
    const duplicateParams = skip ? [
      context.householdId, targetMonth, item.label, item.person,
      table === 'carryovers' ? item.amount : JSON.stringify(selectedIds),
    ] : []
    mutations.push({ index: statements.length, type: table })
    statements.push(guarded(
      `INSERT INTO ${table} (household_id,id,month,label,amount,person,created_at,updated_at${flag})
      SELECT ?,?,?,?,?,?,?,?${flag ? ',0' : ''} WHERE (SELECT status FROM validation)=200${exists} RETURNING id`,
      context.householdId, id, targetMonth, item.label, item.amount, item.person, now, now,
      ...duplicateParams
    ))
  }
  for (const [index, item] of selectedItems.entries()) {
    const amount = item.itemCopyMode === 'labelOnly' ? (item.type === 'income' ? 1 : -1) : item.amount
    insert(item.type === 'income' ? 'incomes' : 'expenses',
      { ...item, amount }, mode === 'skip', selectedIds[index])
  }
  for (const item of snapshot ?? []) {
    if (item.type === 'carryover' && item.flag === 1) {
      result.skipped.carryovers++
      continue
    }
    // 繰越は先行INSERTも含めて重複を排除する。
    insert('carryovers', item, true, runtime.randomUUID())
  }

  const results = await db.batch(statements)
  const status = (results[0].results?.[0] as { status: number } | undefined)?.status
  if (status === 404) throw new HttpError('データが見つかりません', 404)
  if (status === 409) throw new HttpError('コピー元が変更されています。プレビューを再取得してください', 409)
  if (status !== 200) throw new Error('コピーの検証結果を取得できません')
  // D1のmeta.changesはtriggerの書込も含むため、実際の挿入行をRETURNINGで数える。
  for (const { index, type } of mutations) {
    if (results[index].results?.length === 1) result.copied[type]++
    else result.skipped[type]++
  }
  return result
}
function parseCopyMode(value: unknown): CopyMode {
  if (value !== 'add' && value !== 'skip' && value !== 'replace') {
    throw new HttpError('modeが不正です', 400)
  }
  return value
}

function parseSelectedItems(value: unknown): SelectedCopyItem[] {
  if (!Array.isArray(value)) {
    throw new HttpError('selectedItemsが不正です', 400)
  }
  return value.map((item) => {
    const input = assertObject(item)
    const type = input.type === 'income' || input.type === 'expense' ? input.type : null
    const itemCopyMode =
      input.itemCopyMode === 'withAmount' || input.itemCopyMode === 'labelOnly'
        ? input.itemCopyMode
        : null
    if (!type || !itemCopyMode) {
      throw new HttpError('selectedItemsが不正です', 400)
    }
    const amount = parseInteger(input.amount, 'amount')
    if (itemCopyMode === 'withAmount') {
      assertRecordAmount(type, amount)
    }
    return {
      id: parseString(input.id, 'id'),
      label: parseString(input.label, 'label'),
      amount,
      person: parsePerson(input.person),
      type,
      itemCopyMode,
    }
  })
}
