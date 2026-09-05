import { getSession } from './sessions'
import type { HouseholdContext } from './households'
import type { Env, Runtime } from './d1'
import { HttpError, json, readJson } from './http'
import {
  acquireDiagnosisLease,
  getDiagnosisContext,
  getSavedDiagnosis,
  releaseDiagnosisLease,
  saveDiagnosis,
  saveExpenseCategories,
  SOURCE_REVISION_CONFLICT_MESSAGE,
} from './ai-diagnosis-store'
import {
  parseAiDiagnosisMonth,
  parseCategoryAssignments,
  parseDiagnosisView,
  parseRunTokenInput,
  parseSaveDiagnosisInput,
} from '../../../src/features/ai-diagnosis/wire'

export interface WorkerRouteContext {
  request: Request
  env: Env
  runtime: Runtime
  url: URL
  parts: string[]
}

export async function routeAiDiagnosis(
  context: WorkerRouteContext
): Promise<Response | null> {
  if (context.parts[0] !== 'ai-diagnoses') return null
  const token = context.request.headers.get('x-household-session')
  const session = token ? await getSession(context.env.DB, token, context.runtime.now()) : null
  if (!session) throw new HttpError('認証が必要です', 401)
  return (
    (await routeContextOrSaved(context, session)) ??
    (await routeLease(context, session)) ??
    (await routeSave(context, session)) ??
    (await routeCategories(context, session))
  )
}

async function routeContextOrSaved({ request, env, parts }: WorkerRouteContext, household: HouseholdContext) {
  if (parts.length === 3 && parts[2] === 'context' && request.method === 'GET') {
    const month = parseAiDiagnosisMonth(decodeURIComponent(parts[1]))
    return json({ data: await getDiagnosisContext(env.DB, household, month) })
  }
  if (parts.length !== 2 || request.method !== 'GET') return null
  const month = parseAiDiagnosisMonth(decodeURIComponent(parts[1]))
  const saved = await getSavedDiagnosis(env.DB, household, month)
  if (saved === null) return json({ data: null })
  try {
    return json({
      data: { ...saved, diagnosis: parseDiagnosisView(saved.diagnosis) },
    })
  } catch {
    throw new Error('保存済み診断の形式が不正です')
  }
}

async function routeLease({ request, env, runtime, parts }: WorkerRouteContext, household: HouseholdContext) {
  if (parts.length !== 3 || parts[2] !== 'lease') return null
  if (request.method !== 'POST' && request.method !== 'DELETE') return null
  const month = parseAiDiagnosisMonth(decodeURIComponent(parts[1]))
  const input = parseRunTokenInput(await readJson(request))
  if (request.method === 'POST') {
    const lease = await acquireDiagnosisLease(env.DB, runtime, household, month, input.runToken)
    if (lease.acquired) return json({ success: true })
    const status = lease.reason === 'busy' ? 409 : 429
    const error = lease.reason === 'busy'
      ? '診断を実行中です'
      : 'AI診断の利用上限に達しました'
    return json(
      { error },
      { status, headers: { 'Retry-After': String(lease.retryAfterSeconds) } }
    )
  }
  if (request.method !== 'DELETE') return null
  try {
    await releaseDiagnosisLease(env.DB, household, month, input.runToken)
  } catch (error) {
    rethrowDiagnosisConflict(error, [
      '診断リースが失効しているため解放できません',
    ])
  }
  return json({ success: true })
}

async function routeSave({ request, env, runtime, parts }: WorkerRouteContext, household: HouseholdContext) {
  if (parts.length !== 2 || request.method !== 'PUT') return null
  const month = parseAiDiagnosisMonth(decodeURIComponent(parts[1]))
  const input = parseSaveDiagnosisInput(await readJson(request))
  if (input.diagnosis.month !== month) throw new HttpError('診断月が不正です', 400)
  try {
    await saveDiagnosis(env.DB, runtime, household, month, input)
  } catch (error) {
    rethrowDiagnosisConflict(error, [
      '診断リースが失効しているため保存できません',
      SOURCE_REVISION_CONFLICT_MESSAGE,
    ])
  }
  return json({ data: input.diagnosis })
}

async function routeCategories({ request, env, runtime, parts }: WorkerRouteContext, household: HouseholdContext) {
  if (parts.length !== 2 || parts[1] !== 'categories' || request.method !== 'PATCH') {
    return null
  }
  const input = parseCategoryAssignments(await readJson(request))
  try {
    await saveExpenseCategories(
      env.DB,
      runtime,
      household,
      input.month,
      input.runToken,
      input.assignments
    )
  } catch (error) {
    rethrowDiagnosisConflict(error, ['分類中に支出が変更されました'])
  }
  return json({ success: true })
}

function rethrowDiagnosisConflict(error: unknown, messages: string[]): never {
  if (error instanceof Error && messages.includes(error.message)) {
    throw new HttpError(error.message, 409)
  }
  throw error
}
