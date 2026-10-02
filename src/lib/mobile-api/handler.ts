import 'server-only'
import { z } from 'zod'
import { getDatabase, getRuntime } from '@/lib/api/backend'
import { firebaseAuthConfig } from '@/lib/auth/firebase-config'
import { verifyFirebaseToken, FirebaseVerificationError } from '@/lib/auth/firebase-token'
import { allowFirebaseExchange } from '@/lib/api/firebase-rate-limit'
import { completeFirebaseLogin } from '../../../cloudflare/worker/src/firebase-login'
import { readFirebaseSession } from '../../../cloudflare/worker/src/firebase-session'
import { deleteSession } from '../../../cloudflare/worker/src/sessions'
import { HttpError } from '../../../cloudflare/worker/src/http'
import { createRecord, updateRecord, deleteRecord, patchRecordFlag, listRecordsByMonth, type BaseRecord, type ExpenseRecord, type CarryoverRecord } from '../../../cloudflare/worker/src/records'
import type { RecordType } from '../../../cloudflare/worker/src/validation'
import { calculateSettlement } from '@/lib/utils/calculation'
import { aggregateMonthlySummaries, calculateMonthBalance } from '@/lib/utils/monthly-summary'
import { revalidateHouseholdData } from '@/app/actions/revalidation'
import { bearerToken, jsonResponse, MobileApiError, monthSchema, readJson, recordInput, unauthorized } from './http'

const recordTypes: Record<string, RecordType> = { incomes: 'income', expenses: 'expense', carryovers: 'carryover' }
const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/)
const linkRequired = () => new MobileApiError(409, 'web_link_required', 'Webで初回連携を完了してください')

async function exchange(request: Request) {
  const input = z.object({ idToken: z.string().min(1).max(16384), mode: z.enum(['login', 'refresh']) }).strict().parse(await readJson(request))
  const config = firebaseAuthConfig()
  if (!config) throw new MobileApiError(503, 'unavailable', '現在利用できません')
  if (!await allowFirebaseExchange(request.headers)) throw new MobileApiError(429, 'rate_limited', '時間をおいて再試行してください')
  const identity = await verifyFirebaseToken(input.idToken, config.client)
  if ((identity.provider === 'google.com' && !config.client.googleEnabled) || (identity.provider === 'apple.com' && !config.client.appleEnabled)) unauthorized()
  const db = getDatabase()
  const currentToken = input.mode === 'refresh' ? bearerToken(request) : undefined
  if (currentToken && !await readFirebaseSession(db, currentToken, new Date())) unauthorized()
  // 未連携UIDでは移行申請を作らず、Webの既存承認画面へ案内する。
  const linked = await db.prepare('SELECT id FROM firebase_identities WHERE project_id=? AND uid=?').bind(identity.projectId, identity.uid).first()
  if (!linked) throw linkRequired()
  const result = await completeFirebaseLogin(db, getRuntime(), identity, { mode: input.mode, currentToken, rotate: true })
  if (result.kind !== 'authenticated') throw linkRequired()
  return result.session
}

async function dispatch(request: Request, path: string[]) {
  const route = path.join('/')
  if (route === 'auth/exchange' && request.method === 'POST') return exchange(request)
  const db = getDatabase()
  const token = bearerToken(request)
  const session = await readFirebaseSession(db, token, new Date())
  if (!session) return unauthorized()
  const context = Object.freeze({ householdId: session.householdId })
  if (route === 'auth/session' && request.method === 'GET') {
    const { token: omitted, ...info } = session
    void omitted
    return info
  }
  if (route === 'auth/logout' && request.method === 'POST') {
    await deleteSession(db, token)
    return { loggedOut: true }
  }
  if (path[0] === 'months' && request.method === 'GET') {
    if (path.length === 1) {
      const [incomes, expenses, carryovers] = await Promise.all(['incomes', 'expenses', 'carryovers'].map(table =>
        db.prepare(table === 'carryovers' ? 'SELECT DISTINCT month, 0 AS amount FROM carryovers WHERE household_id=?' : `SELECT month, SUM(amount) AS amount FROM ${table} WHERE household_id=? GROUP BY month`).bind(context.householdId).all<{month:string;amount:number}>()))
      const summaries = aggregateMonthlySummaries(incomes.results, expenses.results)
      const byMonth = new Map(summaries.map(item => [item.month, item]))
      const months = [...new Set([...summaries.map(item => item.month), ...carryovers.results.map(item => item.month)])].sort().reverse()
      return { months: months.map(month => byMonth.get(month) ?? { month, incomeTotal: 0, expenseTotal: 0, balance: 0 }) }
    }
    if (path.length === 2) {
      const month = monthSchema.parse(path[1])
      const [incomes, expenses, carryovers] = await Promise.all([
        listRecordsByMonth(db,context,'income',month), listRecordsByMonth(db,context,'expense',month), listRecordsByMonth(db,context,'carryover',month),
      ])
      return { month, incomes, expenses, carryovers, monthBalance: calculateMonthBalance(incomes, expenses), settlement: calculateSettlement(incomes as BaseRecord[], expenses as ExpenseRecord[], carryovers as CarryoverRecord[]) }
    }
  }
  const type = Object.hasOwn(recordTypes, path[0]) ? recordTypes[path[0]] : undefined
  if (!type || path.length > 2) throw new MobileApiError(404, 'not_found', 'データが見つかりません')
  const runtime = getRuntime()
  if (path.length === 1 && request.method === 'POST') {
    const input = recordInput(type, await readJson(request), true)
    const result = await createRecord(db,runtime,context,type,input)
    revalidateHouseholdData(result.month)
    revalidateHouseholdData()
    return result
  }
  if (path.length !== 2) throw new MobileApiError(404, 'not_found', 'データが見つかりません')
  const id = idSchema.parse(path[1])
  // 認可された月だけ再検証し、存在しないIDを先に拒否する。
  const table = path[0]
  const existing = await db.prepare(`SELECT month FROM ${table} WHERE id=? AND household_id=?`).bind(id,context.householdId).first<{month:string}>()
  if (!existing) throw new MobileApiError(404, 'not_found', 'データが見つかりません')
  let result: unknown
  if (request.method === 'PUT') result = await updateRecord(db,runtime,context,type,id,recordInput(type,await readJson(request),false))
  else if (request.method === 'DELETE') { await deleteRecord(db,context,type,id); result = { deleted:true } }
  else if (request.method === 'PATCH' && type !== 'income') {
    const schema = type === 'expense' ? z.object({isCarryover:z.boolean()}).strict() : z.object({isCleared:z.boolean()}).strict()
    await patchRecordFlag(db,runtime,context,type,id,schema.parse(await readJson(request)))
    result = { updated:true }
  } else throw new MobileApiError(404, 'not_found', 'データが見つかりません')
  revalidateHouseholdData(existing.month)
  revalidateHouseholdData()
  return result
}

export async function handleMobileRequest(request: Request, path: string[]): Promise<Response> {
  try { return jsonResponse({ data: await dispatch(request,path) }) }
  catch (error) {
    if (error instanceof MobileApiError) return jsonResponse({error:{code:error.code,message:error.message}},error.status)
    if (error instanceof z.ZodError || (error instanceof HttpError && error.status === 400)) return jsonResponse({error:{code:'invalid_input',message:'入力が不正です'}},400)
    if (error instanceof FirebaseVerificationError || (error instanceof HttpError && error.status === 401)) return jsonResponse({error:{code:'unauthorized',message:'認証が必要です'}},401)
    if (error instanceof HttpError && error.status === 404) return jsonResponse({error:{code:'not_found',message:'データが見つかりません'}},404)
    // 外部例外には秘密情報が含まれうるため、本文・causeを返却も記録もしない。
    return jsonResponse({error:{code:'unavailable',message:'現在利用できません'}},503)
  }
}
