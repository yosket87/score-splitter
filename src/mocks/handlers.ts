import { createRecordHandlers } from './record-handlers'
/**
 * MSWハンドラー: Cloudflare Worker APIをインターセプト
 */

import { createAuthHandlers } from './auth-handlers'
import { createPaymentHandlers } from './payment-handlers'
import { http, HttpResponse } from 'msw'
import {
  AiDiagnosisWireError,
  parseAiDiagnosisMonth,
  parseCategoryAssignments,
  parseDiagnosisView,
  parseRunTokenInput,
  parseSaveDiagnosisInput,
} from '@/features/ai-diagnosis/wire'
import { getTable } from './db'
import { incrementAiDiagnosisMockStat } from './ai-diagnosis-stats'
import {
  AI_DIAGNOSIS_DAILY_LIMIT,
  AI_DIAGNOSIS_GLOBAL_COOLDOWN_MS,
  AI_DIAGNOSIS_LEASE_DURATION_MS,
} from '@/features/ai-diagnosis/limits'

const WORKER_API_URL =
  process.env.CLOUDFLARE_WORKER_API_URL || 'http://mock-worker.local'
const WORKER_API_TOKEN = process.env.CLOUDFLARE_WORKER_API_TOKEN || 'mock-worker-token'

export const handlers = [
  http.all(`${WORKER_API_URL}/sessions`, () => notFound()),
  ...createRecordHandlers(WORKER_API_URL, WORKER_API_TOKEN),
  ...createAuthHandlers(WORKER_API_URL, WORKER_API_TOKEN),
  ...createPaymentHandlers(WORKER_API_URL, WORKER_API_TOKEN),
  http.post(`${WORKER_API_URL}/waitlist`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string
      priceIntent?: string
      simulatorUsed?: boolean
      website?: string
    }

    // honeypot: 成功を装い保存しない
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return HttpResponse.json({ data: { registered: true } }, { status: 201 })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const validIntent = body.priceIntent === 'free_only' || body.priceIntent === 'paid_ok'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validIntent) {
      return HttpResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
    }

    const table = getTable('waitlist_entries')
    if (!table.some((row) => row.email === email)) {
      table.push({
        id: `waitlist-${table.length + 1}`,
        email,
        price_intent: body.priceIntent,
        simulator_used: body.simulatorUsed ? 1 : 0,
        created_at: new Date().toISOString(),
      })
    }
    return HttpResponse.json({ data: { registered: true } }, { status: 201 })
  }),

  http.post(`${WORKER_API_URL}/login-attempts/check`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    return HttpResponse.json({ data: { allowed: true } })
  }),

  http.post(`${WORKER_API_URL}/login-attempts/failure`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    return HttpResponse.json({ data: { allowed: true } })
  }),

  http.post(`${WORKER_API_URL}/login-attempts/reset`, ({ request }) => {
    if (!isAuthorized(request)) return unauthorized()
    return HttpResponse.json({ success: true })
  }),

  http.get(`${WORKER_API_URL}/ai-diagnoses/:month/context`, ({ params, request }) => handleAiWire(async () => {
    if (!isAuthorized(request)) return unauthorized()
    const targetMonth = parseAiDiagnosisMonth(params.month)
    const months = getDiagnosisMonths(targetMonth)
    return HttpResponse.json({
      data: {
        targetMonth,
        sourceRevision: Number(
          getTable('ai_diagnosis_source_revision')[0]?.revision ?? 0
        ),
        incomes: getTable('incomes')
          .filter(({ month }) => months.includes(String(month)))
          .map(({ month, amount }) => ({ month, amount })),
        expenses: getTable('expenses')
          .filter(({ month }) => months.includes(String(month)))
          .map(({ id, month, label, amount, is_carryover, ai_category }) => ({
            id,
            month,
            label,
            amount,
            isCarryover: is_carryover === true,
            aiCategory: ai_category ?? null,
          })),
        carryovers: getTable('carryovers')
          .filter(({ month }) => months.includes(String(month)))
          .map(({ month, amount, is_cleared }) => ({
            month,
            amount,
            isCleared: is_cleared === true,
          })),
      },
    })
  })),

  http.get(`${WORKER_API_URL}/ai-diagnoses/:month`, ({ params, request }) => handleAiWire(async () => {
    if (!isAuthorized(request)) return unauthorized()
    const month = parseAiDiagnosisMonth(params.month)
    const row = getTable('ai_diagnoses').find((record) => record.month === month)
    if (!row || row.result_json == null) return HttpResponse.json({ data: null })
    if (
      typeof row.input_hash !== 'string' ||
      typeof row.analysis_version !== 'string'
    ) {
      return internalError()
    }
    let diagnosis: ReturnType<typeof parseDiagnosisView>
    try {
      diagnosis = parseDiagnosisView(row.result_json)
    } catch {
      return internalError()
    }
    return HttpResponse.json({
      data: {
        diagnosis,
        inputHash: row.input_hash,
        analysisVersion: row.analysis_version,
        updatedAt: row.updated_at,
      },
    })
  })),

  http.post(`${WORKER_API_URL}/ai-diagnoses/:month/lease`, ({ params, request }) => handleAiWire(async () => {
    if (!isAuthorized(request)) return unauthorized()
    const month = parseAiDiagnosisMonth(params.month)
    const { runToken } = parseRunTokenInput(await readAiJson(request))
    const now = new Date()
    const nowIso = now.toISOString()
    const diagnoses = getTable('ai_diagnoses')
    const existing = diagnoses.find((record) => record.month === month)
    const guard = getTable('ai_execution_guard')[0]
    if (
      (existing?.run_token != null &&
        typeof existing.run_expires_at === 'string' &&
        existing.run_expires_at >= nowIso) ||
      (guard?.run_token != null &&
        typeof guard.run_expires_at === 'string' &&
        guard.run_expires_at >= nowIso)
    ) {
      return HttpResponse.json(
        { error: '診断を実行中です' },
        { status: 409, headers: { 'Retry-After': '120' } }
      )
    }
    const usageDate = nowIso.slice(0, 10)
    if (
      guard?.usage_date === usageDate &&
      Number(guard.daily_count) >= AI_DIAGNOSIS_DAILY_LIMIT
    ) {
      const tomorrow = new Date(`${usageDate}T00:00:00.000Z`)
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      return HttpResponse.json(
        { error: 'AI診断の利用上限に達しました' },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000))
            ),
          },
        }
      )
    }
    if (
      typeof guard?.last_started_at === 'string' &&
      new Date(guard.last_started_at).getTime() + AI_DIAGNOSIS_GLOBAL_COOLDOWN_MS >
        now.getTime()
    ) {
      const retryAfter = Math.ceil(
        (new Date(guard.last_started_at).getTime() +
          AI_DIAGNOSIS_GLOBAL_COOLDOWN_MS -
          now.getTime()) /
          1000
      )
      return HttpResponse.json(
        { error: 'AI診断の利用上限に達しました' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } }
      )
    }
    const lease = {
      run_token: runToken,
      run_expires_at: new Date(
        now.getTime() + AI_DIAGNOSIS_LEASE_DURATION_MS
      ).toISOString(),
      updated_at: nowIso,
    }
    if (existing) Object.assign(existing, lease)
    else {
      diagnoses.push({
        id: crypto.randomUUID(),
        month,
        result_json: null,
        input_hash: null,
        analysis_version: null,
        created_at: nowIso,
        ...lease,
      })
    }
    Object.assign(guard, {
      ...lease,
      last_started_at: nowIso,
      usage_date: usageDate,
      daily_count:
        guard.usage_date === usageDate ? Number(guard.daily_count) + 1 : 1,
    })
    return HttpResponse.json({ success: true })
  })),

  http.patch(`${WORKER_API_URL}/ai-diagnoses/categories`, ({ request }) => handleAiWire(async () => {
    if (!isAuthorized(request)) return unauthorized()
    const { month, runToken, assignments } = parseCategoryAssignments(
      await readAiJson(request)
    )
    const lease = getTable('ai_diagnoses').find(
      (record) => record.month === month && record.run_token === runToken
    )
    const guard = getTable('ai_execution_guard')[0]
    const nowDate = new Date()
    if (
      !lease ||
      typeof lease.run_expires_at !== 'string' ||
      lease.run_expires_at < nowDate.toISOString() ||
      guard?.run_token !== runToken ||
      typeof guard.run_expires_at !== 'string' ||
      guard.run_expires_at < nowDate.toISOString()
    ) {
      return HttpResponse.json(
        { error: '分類の実行権限が失効しました' },
        { status: 409 }
      )
    }
    const now = new Date().toISOString()
    const updates = assignments.flatMap((assignment) =>
      assignment.expenseIds.map((expenseId) => ({ expenseId, assignment }))
    ).map(({ expenseId, assignment }) => ({
      row: getTable('expenses').find(
        ({ id, label, ai_category }) =>
          id === expenseId &&
          label === assignment.expectedLabel &&
          ai_category == null
      ),
      category: assignment.category,
    }))
    if (updates.some(({ row }) => row === undefined)) {
      return HttpResponse.json(
        { error: '分類中に支出が変更されました' },
        { status: 409 }
      )
    }
    for (const { row, category } of updates) {
      Object.assign(row!, {
        ai_category: category,
        ai_category_source: 'ai',
        ai_categorized_at: now,
        updated_at: now,
      })
    }
    return HttpResponse.json({ success: true })
  })),

  http.put(`${WORKER_API_URL}/ai-diagnoses/:month`, ({ params, request }) => handleAiWire(async () => {
    if (!isAuthorized(request)) return unauthorized()
    const month = parseAiDiagnosisMonth(params.month)
    const body = parseSaveDiagnosisInput(await readAiJson(request))
    if (body.diagnosis.month !== month) {
      throw new AiDiagnosisWireError('診断月が不正です')
    }
    const row = getTable('ai_diagnoses').find((record) => record.month === month)
    const guard = getTable('ai_execution_guard')[0]
    const nowIso = new Date().toISOString()
    const sourceRevision = Number(
      getTable('ai_diagnosis_source_revision')[0]?.revision ?? -1
    )
    if (sourceRevision !== body.expectedSourceRevision) {
      return HttpResponse.json(
        { error: '診断対象データが更新されたため保存できません' },
        { status: 409 }
      )
    }
    if (
      !row ||
      row.run_token !== body.runToken ||
      typeof row.run_expires_at !== 'string' ||
      row.run_expires_at < nowIso ||
      guard?.run_token !== body.runToken ||
      typeof guard.run_expires_at !== 'string' ||
      guard.run_expires_at < nowIso
    ) {
      return HttpResponse.json(
        { error: '診断リースが失効しているため保存できません' },
        { status: 409 }
      )
    }
    const now = new Date().toISOString()
    Object.assign(row, {
      result_json: body.diagnosis,
      input_hash: body.inputHash,
      analysis_version: body.analysisVersion,
      run_token: null,
      run_expires_at: null,
      updated_at: now,
    })
    Object.assign(guard, { run_token: null, run_expires_at: null })
    incrementAiDiagnosisMockStat('diagnosisSaveCalls')
    return HttpResponse.json({ data: body.diagnosis })
  })),

  http.delete(`${WORKER_API_URL}/ai-diagnoses/:month/lease`, ({ params, request }) => handleAiWire(async () => {
    if (!isAuthorized(request)) return unauthorized()
    const month = parseAiDiagnosisMonth(params.month)
    const { runToken } = parseRunTokenInput(await readAiJson(request))
    const row = getTable('ai_diagnoses').find((record) => record.month === month)
    if (!row || row.run_token !== runToken) {
      return HttpResponse.json(
        { error: '診断リースが失効しているため解放できません' },
        { status: 409 }
      )
    }
    Object.assign(row, { run_token: null, run_expires_at: null })
    const guard = getTable('ai_execution_guard')[0]
    if (guard?.run_token === runToken) {
      Object.assign(guard, { run_token: null, run_expires_at: null })
    }
    return HttpResponse.json({ success: true })
  })),


]

function isAuthorized(request: Request): boolean {
  return request.headers.get('authorization') === `Bearer ${WORKER_API_TOKEN}`
}

function unauthorized() {
  return HttpResponse.json({ error: '認証に失敗しました' }, { status: 401 })
}

function notFound() {
  return HttpResponse.json({ error: 'エンドポイントが見つかりません' }, { status: 404 })
}

function internalError() {
  return HttpResponse.json({ error: '内部エラーが発生しました' }, { status: 500 })
}

async function readAiJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new AiDiagnosisWireError('JSONの形式が不正です')
  }
}

async function handleAiWire(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof AiDiagnosisWireError) {
      return HttpResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

function getDiagnosisMonths(targetMonth: string): string[] {
  if (!/^\d{6}$/.test(targetMonth)) return []
  const year = Number(targetMonth.slice(0, 4))
  const month = Number(targetMonth.slice(4, 6))
  if (month < 1 || month > 12) return []
  const targetIndex = year * 12 + month - 1
  return Array.from({ length: 4 }, (_, offset) => {
    const index = targetIndex - offset
    return `${Math.floor(index / 12)}${String((index % 12) + 1).padStart(2, '0')}`
  })
}
