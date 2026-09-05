import { http, HttpResponse } from 'msw'
import { validSession } from './auth-handlers'
import { getTable, insertRows, updateRows, deleteRows, applyOrder } from './db'
import { carryoverFingerprint, normalizeCarryoverSnapshot, type CarryoverSnapshot } from '../../cloudflare/worker/src/copy-month-guard'
import { assertObject, assertRecordAmount, parseMonth, parseString, parsePerson, parseInteger, parseBoolean } from '../../cloudflare/worker/src/validation'
import { HttpError } from '../../cloudflare/worker/src/http'
type Row = Record<string, unknown>
type Table = 'incomes' | 'expenses' | 'carryovers'
const tables: Table[] = ['incomes', 'expenses', 'carryovers']
const apiRow = (table: Table, row: Row) => ({ id: row.id, month: row.month, label: row.label, amount: row.amount, person: row.person, createdAt: row.created_at,
  ...(table === 'expenses' ? { isCarryover: !!row.is_carryover } : table === 'carryovers' ? { isCleared: !!row.is_cleared } : {}) })
const data = (value: unknown, status = 200) => HttpResponse.json({ data: value }, { status })
const success = () => HttpResponse.json({ success: true })
const absent = () => { throw new HttpError('データが見つかりません', 404) }
function inputRecord(table: Table, body: Row) {
  const amount = parseInteger(body.amount, 'amount')
  assertRecordAmount(table === 'incomes' ? 'income' : table === 'expenses' ? 'expense' : 'carryover', amount)
  return { month: parseMonth(body.month), label: parseString(body.label, 'label'), amount, person: parsePerson(body.person),
    ...(table === 'expenses' ? { is_carryover: parseBoolean(body.isCarryover ?? false, 'isCarryover') } : table === 'carryovers' ? { is_cleared: parseBoolean(body.isCleared ?? false, 'isCleared') } : {}) }
}
function snapshot(rows: (table: Table, month?: string) => Row[], month: string): CarryoverSnapshot[] {
  return [...rows('carryovers', month).map(row => ({ ...row, type: 'carryover', flag: row.is_cleared ? 1 : 0 })),
    ...rows('expenses', month).filter(row => row.is_carryover).map(row => ({ ...row, type: 'expense', flag: 1 }))] as unknown as CarryoverSnapshot[]
}
export function createRecordHandlers(baseUrl: string, token: string) {
  const handle = async (request: Request) => {
    try {
      if (request.headers.get('authorization') !== `Bearer ${token}`)
        throw new HttpError('認証が必要です', 401)
      const session = validSession(request.headers.get('x-household-session') ?? '')
      if (!session)
        throw new HttpError('認証が必要です', 401)
      const householdId = String(session.household_id)
      const rows = (table: Table, month?: string) => getTable(table).filter(row => row.household_id === householdId && (month === undefined || row.month === month))
      const url = new URL(request.url), [path, id, flag] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      const scopedId = { household_id: `eq.${householdId}`, id: `eq.${id}` }
      if (path === 'monthly-amounts')
        return data({ incomes: rows('incomes').map(({ month, amount }) => ({ month, amount })), expenses: rows('expenses').map(({ month, amount }) => ({ month, amount })) })
      if (path === 'copy-month') {
        if ((id === 'preview' && request.method !== 'GET') || (!id && request.method !== 'POST')) return absent()
        if (request.method === 'GET') {
          const sourceMonth = parseMonth(url.searchParams.get('sourceMonth')), targetMonth = parseMonth(url.searchParams.get('targetMonth'))
          return data({ sourceMonth, targetMonth, items: [...rows('incomes', sourceMonth).map(row => ({ id:row.id,label:row.label,amount:row.amount,person:row.person,type: 'income' })),
              ...rows('expenses', sourceMonth).filter(row => !row.is_carryover).map(row => ({ id:row.id,label:row.label,amount:row.amount,person:row.person,type: 'expense' }))],
            carryoverCount: snapshot(rows, sourceMonth).length, carryoverFingerprint: await carryoverFingerprint(snapshot(rows, sourceMonth)), existingCount: tables.reduce((n, t) => n + rows(t, targetMonth).length, 0) })
        }
        return HttpResponse.json(await copy(assertObject(await request.json()), householdId, rows))
      }
      const table = path as Table
      if ((!id && !['GET','POST'].includes(request.method)) || (id && !['PATCH','DELETE'].includes(request.method))) return absent()
      if (!tables.includes(table))
        throw new HttpError('エンドポイントが見つかりません', 404)
      if (request.method === 'GET')
        return data(applyOrder(rows(table, parseMonth(url.searchParams.get('month'))), table === 'incomes' ? 'amount.desc' : table === 'expenses' ? 'amount.asc' : 'created_at.asc').map(row => apiRow(table, row)))
      if (request.method === 'POST')
        return data(apiRow(table, insertRows(table, [{ ...inputRecord(table, assertObject(await request.json())), household_id: householdId }])[0]), 201)
      const existing = rows(table).find(row => row.id === id)
      if (!existing)
        return absent()
      if (request.method === 'DELETE') {
        deleteRows(table, scopedId)
        return success()
      }
      const body = assertObject(await request.json())
      if (flag) {
        if (table === 'expenses' && flag === 'carryover')
          updateRows(table, scopedId, { is_carryover: parseBoolean(body.isCarryover, 'isCarryover') })
        else if (table === 'carryovers' && flag === 'cleared')
          updateRows(table, scopedId, { is_cleared: parseBoolean(body.isCleared, 'isCleared') })
        else
          return absent()
        return success()
      }
      const input = inputRecord(table, body)
      const reset = table === 'expenses' && existing.label !== input.label ? { ai_category: null, ai_category_source: null, ai_categorized_at: null } : {}
      return data(apiRow(table, updateRows(table, scopedId, { ...input, month: existing.month, ...reset })[0]))
    }
    catch (error) {
      if (error instanceof SyntaxError) return HttpResponse.json({error:'JSONの形式が不正です'},{status:400})
      if (error instanceof HttpError)
        return HttpResponse.json({ error: error.message }, { status: error.status })
      throw error
    }
  }
  return [http.all(`${baseUrl}/copy-month`, ({ request }) => handle(request)), http.all(`${baseUrl}/copy-month/preview`, ({ request }) => handle(request)),
    http.get(`${baseUrl}/monthly-amounts`, ({ request }) => handle(request)),
    ...tables.flatMap(table => [http.all(`${baseUrl}/${table}`, ({ request }) => handle(request)), http.all(`${baseUrl}/${table}/:id`, ({ request }) => handle(request)), http.patch(`${baseUrl}/${table}/:id/:flag`, ({ request }) => handle(request))])]
}
async function copy(body: Row, householdId: string, rows: (table: Table, month?: string) => Row[]) {
  const sourceMonth = parseMonth(body.sourceMonth), targetMonth = parseMonth(body.targetMonth)
  if (sourceMonth === targetMonth)
    throw new HttpError('同じ月にはコピーできません', 400)
  if (!['add', 'skip', 'replace'].includes(String(body.mode)) || !Array.isArray(body.selectedItems))
    throw new HttpError('コピー入力が不正です', 400)
  const includeCarryover = parseBoolean(body.includeCarryover, 'includeCarryover')
  const selected = body.selectedItems.map(item => {
    const value = assertObject(item)
    if (!['income', 'expense'].includes(String(value.type)) || !['withAmount', 'labelOnly'].includes(String(value.itemCopyMode)))
      throw new HttpError('コピー入力が不正です', 400)
    const table: Table = value.type === 'income' ? 'incomes' : 'expenses'
    const id = parseString(value.id, 'id'), label = parseString(value.label, 'label'), person = parsePerson(value.person), amount = parseInteger(value.amount, 'amount')
    if (value.itemCopyMode === 'withAmount')
      assertRecordAmount(value.type as 'income' | 'expense', amount)
    return { table, id, label, person, amount, mode: value.itemCopyMode }
  })
  const carryovers = snapshot(rows, sourceMonth)
  const fingerprintMatches = !includeCarryover || body.carryoverFingerprint === await carryoverFingerprint(carryovers)
  // 全選択の存在を先に判定し、一件の不正でも置換DELETEへ到達させない。
  for (const item of selected)
    if (!rows(item.table, sourceMonth).some(row => row.id === item.id))
      return absent()
  for (const item of selected) {
    const source = rows(item.table, sourceMonth).find(row => row.id === item.id)!
    if (source.label !== item.label || source.person !== item.person || source.is_carryover || item.mode === 'withAmount' && source.amount !== item.amount)
      throw new HttpError('コピー元が変更されています', 409)
  }
  // digestのawait中に別リクエストが更新しても、同期検証から全mutationまでは割り込ませない。
  if (!fingerprintMatches || (includeCarryover && normalizeCarryoverSnapshot(carryovers) !== normalizeCarryoverSnapshot(snapshot(rows, sourceMonth)))) {
    throw new HttpError('コピー元の繰越が変更されています', 409)
  }
  const result = { success: true, copied: { incomes: 0, expenses: 0, carryovers: 0 }, skipped: { incomes: 0, expenses: 0, carryovers: 0 } }
  if (body.mode === 'replace')
    for (const table of tables)
      if (table === 'carryovers' ? includeCarryover : selected.some(item => item.table === table))
        deleteRows(table, { household_id: `eq.${householdId}`, month: `eq.${targetMonth}` })
  const insertedIds = new Set<unknown>()
  const insert = (table: Table, item: {
    label: string
    amount: number
    person: string
  }, skip: boolean) => {
    if (skip && rows(table, targetMonth).some(row => (table === 'carryovers' || !insertedIds.has(row.id)) && row.label === item.label && row.person === item.person && (table !== 'carryovers' || row.amount === item.amount))) {
      result.skipped[table]++
      return
    }
    const inserted = insertRows(table, [{ ...item, household_id: householdId, month: targetMonth, ...(table === 'expenses' ? { is_carryover: false } : table === 'carryovers' ? { is_cleared: false } : {}) }])
    insertedIds.add(inserted[0].id)
    result.copied[table]++
  }
  for (const item of selected)
    insert(item.table, { label: item.label, person: item.person, amount: item.mode === 'labelOnly' ? (item.table === 'incomes' ? 1 : -1) : item.amount }, body.mode === 'skip')
  if (includeCarryover)
    for (const item of carryovers) {
      if (item.type === 'carryover' && item.flag === 1)
        result.skipped.carryovers++
      else
        insert('carryovers', { label: item.label, amount: item.amount, person: item.person }, true)
    }
  return result
}
