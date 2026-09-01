import { copyMonthData, getCopyMonthPreview } from './copy-month'
import { createRuntime, type Env, type RuntimeDeps } from './d1'
import { assertAuth, errorJson, HttpError, json, readJson } from './http'
import { registerWaitlistEntry } from './waitlist'
import {
  createChallenge,
  deleteChallenges,
  deleteExpiredChallenges,
  getLatestChallenge,
  parseChallengeType,
} from './challenges'
import {
  createRecord,
  deleteRecord,
  listMonthlyAmounts,
  listRecordsByMonth,
  patchRecordFlag,
  updateRecord,
} from './records'
import { createSession, deleteSession, getSession } from './sessions'
import {
  createPasskey,
  deletePasskey,
  getPasskey,
  listPasskeys,
  updatePasskeyCounter,
} from './passkeys'
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
} from './login-attempts'
import {
  acquireDiagnosisLease,
  getDiagnosisContext,
  getSavedDiagnosis,
  releaseDiagnosisLease,
  saveDiagnosis,
  saveExpenseCategories,
  type StoreCategoryAssignment,
} from './ai-diagnosis-store'
import { assertObject, parseMonth, parseString } from './validation'
import type {
  AiCategory,
  AiDiagnosisView,
  DiagnosisViewItem,
  SaveDiagnosisInput,
} from '../../../src/features/ai-diagnosis/domain'
import { AI_CATEGORY_SET } from '../../../src/features/ai-diagnosis/categories'

const worker = {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  },
}

export default worker

export async function handleRequest(
  request: Request,
  env: Env,
  deps: RuntimeDeps = {}
): Promise<Response> {
  try {
    const runtime = createRuntime(deps)
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

    // ウェイトリスト登録はLPから未認証で呼ばれる唯一の公開エンドポイント
    if (parts.length === 1 && parts[0] === 'waitlist' && request.method === 'POST') {
      return json(
        { data: await registerWaitlistEntry(env.DB, runtime, await readJson(request)) },
        { status: 201 }
      )
    }

    assertAuth(request, env.WORKER_API_TOKEN)

    if (
      parts.length === 3 &&
      parts[0] === 'ai-diagnoses' &&
      parts[2] === 'context' &&
      request.method === 'GET'
    ) {
      const month = parseMonth(decodeURIComponent(parts[1]))
      return json({ data: await getDiagnosisContext(env.DB, month) })
    }

    if (
      parts.length === 2 &&
      parts[0] === 'ai-diagnoses' &&
      request.method === 'GET'
    ) {
      const month = parseMonth(decodeURIComponent(parts[1]))
      const saved = await getSavedDiagnosis(env.DB, month)
      if (saved === null) return json({ data: null })
      try {
        return json({ data: { ...saved, diagnosis: parseDiagnosisView(saved.diagnosis) } })
      } catch {
        throw new Error('保存済み診断の形式が不正です')
      }
    }

    if (
      parts.length === 3 &&
      parts[0] === 'ai-diagnoses' &&
      parts[2] === 'lease' &&
      request.method === 'POST'
    ) {
      const month = parseMonth(decodeURIComponent(parts[1]))
      const input = parseRunTokenInput(await readJson(request))
      const acquired = await acquireDiagnosisLease(env.DB, runtime, month, input.runToken)
      if (!acquired) throw new HttpError('診断を実行中です', 409)
      return json({ success: true })
    }

    if (
      parts.length === 3 &&
      parts[0] === 'ai-diagnoses' &&
      parts[2] === 'lease' &&
      request.method === 'DELETE'
    ) {
      const month = parseMonth(decodeURIComponent(parts[1]))
      const input = parseRunTokenInput(await readJson(request))
      try {
        await releaseDiagnosisLease(env.DB, month, input.runToken)
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === '診断リースが失効しているため解放できません'
        ) {
          throw new HttpError(error.message, 409)
        }
        throw error
      }
      return json({ success: true })
    }

    if (
      parts.length === 2 &&
      parts[0] === 'ai-diagnoses' &&
      request.method === 'PUT'
    ) {
      const month = parseMonth(decodeURIComponent(parts[1]))
      const input = parseSaveDiagnosisInput(await readJson(request))
      if (input.diagnosis.month !== month) {
        throw new HttpError('診断月が不正です', 400)
      }
      try {
        await saveDiagnosis(env.DB, runtime, month, input)
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === '診断リースが失効しているため保存できません'
        ) {
          throw new HttpError(error.message, 409)
        }
        throw error
      }
      return json({ data: input.diagnosis })
    }

    if (
      parts.length === 2 &&
      parts[0] === 'ai-diagnoses' &&
      parts[1] === 'categories' &&
      request.method === 'PATCH'
    ) {
      const assignments = parseCategoryAssignments(await readJson(request))
      try {
        await saveExpenseCategories(env.DB, runtime, assignments)
      } catch (error) {
        if (error instanceof Error && error.message === '分類中に支出が変更されました') {
          throw new HttpError(error.message, 409)
        }
        throw error
      }
      return json({ success: true })
    }

    if (parts.length === 1 && isRecordPath(parts[0])) {
      const type = recordTypeFromPath(parts[0])
      if (request.method === 'GET') {
        const month = parseMonth(url.searchParams.get('month'))
        return json({ data: await listRecordsByMonth(env.DB, type, month) })
      }
      if (request.method === 'POST') {
        const data = await createRecord(env.DB, runtime, type, await readJson(request))
        return json({ data }, { status: 201 })
      }
    }

    if (parts.length === 2 && isRecordPath(parts[0])) {
      const type = recordTypeFromPath(parts[0])
      const id = decodeURIComponent(parts[1])
      if (request.method === 'PATCH') {
        const data = await updateRecord(env.DB, runtime, type, id, await readJson(request))
        return json({ data })
      }
      if (request.method === 'DELETE') {
        await deleteRecord(env.DB, type, id)
        return json({ success: true })
      }
    }

    if (parts.length === 3 && parts[0] === 'expenses' && parts[2] === 'carryover') {
      if (request.method === 'PATCH') {
        await patchRecordFlag(env.DB, runtime, 'expense', decodeURIComponent(parts[1]), await readJson(request))
        return json({ success: true })
      }
    }

    if (parts.length === 3 && parts[0] === 'carryovers' && parts[2] === 'cleared') {
      if (request.method === 'PATCH') {
        await patchRecordFlag(env.DB, runtime, 'carryover', decodeURIComponent(parts[1]), await readJson(request))
        return json({ success: true })
      }
    }

    if (parts.length === 1 && parts[0] === 'monthly-amounts' && request.method === 'GET') {
      return json({ data: await listMonthlyAmounts(env.DB) })
    }

    if (parts.length === 2 && parts[0] === 'copy-month' && parts[1] === 'preview') {
      if (request.method === 'GET') {
        const sourceMonth = parseMonth(url.searchParams.get('sourceMonth'))
        const targetMonth = parseMonth(url.searchParams.get('targetMonth'))
        return json({ data: await getCopyMonthPreview(env.DB, sourceMonth, targetMonth) })
      }
    }

    if (parts.length === 1 && parts[0] === 'copy-month' && request.method === 'POST') {
      return json(await copyMonthData(env.DB, runtime, await readJson(request)))
    }

    if (parts.length === 1 && parts[0] === 'sessions' && request.method === 'POST') {
      return json({ data: await createSession(env.DB, runtime, await readJson(request)) }, { status: 201 })
    }

    if (parts.length === 2 && parts[0] === 'sessions') {
      const token = decodeURIComponent(parts[1])
      if (request.method === 'GET') {
        return json({ data: await getSession(env.DB, token) })
      }
      if (request.method === 'DELETE') {
        await deleteSession(env.DB, token)
        return json({ success: true })
      }
    }

    if (parts.length === 1 && parts[0] === 'passkeys') {
      if (request.method === 'GET') {
        return json({ data: await listPasskeys(env.DB, url.searchParams.get('person')) })
      }
      if (request.method === 'POST') {
        return json({ data: await createPasskey(env.DB, runtime, await readJson(request)) }, { status: 201 })
      }
    }

    if (parts.length === 2 && parts[0] === 'passkeys') {
      const id = decodeURIComponent(parts[1])
      if (request.method === 'GET') {
        return json({ data: await getPasskey(env.DB, id) })
      }
      if (request.method === 'PATCH') {
        await updatePasskeyCounter(env.DB, id, await readJson(request))
        return json({ success: true })
      }
      if (request.method === 'DELETE') {
        await deletePasskey(env.DB, id)
        return json({ success: true })
      }
    }

    if (parts.length === 1 && parts[0] === 'webauthn-challenges') {
      if (request.method === 'POST') {
        return json({ data: await createChallenge(env.DB, runtime, await readJson(request)) }, { status: 201 })
      }
      if (request.method === 'DELETE') {
        const type = parseChallengeType(url.searchParams.get('type'))
        const person = url.searchParams.get('person')
        await deleteChallenges(env.DB, type, person)
        return json({ success: true })
      }
    }

    if (parts.length === 2 && parts[0] === 'webauthn-challenges' && parts[1] === 'latest') {
      if (request.method === 'GET') {
        const type = parseChallengeType(url.searchParams.get('type'))
        const person = url.searchParams.get('person')
        return json({ data: await getLatestChallenge(env.DB, type, person) })
      }
    }

    if (parts.length === 2 && parts[0] === 'webauthn-challenges' && parts[1] === 'expired') {
      if (request.method === 'DELETE') {
        await deleteExpiredChallenges(env.DB, url.searchParams.get('before') ?? runtime.now().toISOString())
        return json({ success: true })
      }
    }

    if (parts.length === 2 && parts[0] === 'login-attempts') {
      if (request.method === 'POST' && parts[1] === 'check') {
        return json({
          data: await checkLoginRateLimit(env.DB, runtime, await readJson(request)),
        })
      }
      if (request.method === 'POST' && parts[1] === 'failure') {
        return json({
          data: await recordFailedLoginAttempt(
            env.DB,
            runtime,
            await readJson(request)
          ),
        })
      }
      if (request.method === 'POST' && parts[1] === 'reset') {
        await resetLoginAttempts(env.DB, await readJson(request))
        return json({ success: true })
      }
    }

    return errorJson('エンドポイントが見つかりません', 404)
  } catch (error) {
    if (error instanceof HttpError) {
      return errorJson(error.message, error.status)
    }
    console.error('[worker]', error)
    return errorJson('内部エラーが発生しました', 500)
  }
}

function isRecordPath(path: string): path is 'incomes' | 'expenses' | 'carryovers' {
  return path === 'incomes' || path === 'expenses' || path === 'carryovers'
}

function recordTypeFromPath(path: 'incomes' | 'expenses' | 'carryovers') {
  if (path === 'expenses') return 'expense'
  if (path === 'carryovers') return 'carryover'
  return 'income'
}

function parseRunTokenInput(value: unknown): { runToken: string } {
  const input = assertObject(value)
  assertExactKeys(input, ['runToken'])
  return { runToken: parseString(input.runToken, 'runToken') }
}

function assertExactKeys(input: Record<string, unknown>, allowedKeys: string[]): void {
  if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
    throw new HttpError('リクエスト形式が不正です', 400)
  }
}

const MAX_CATEGORY_EXPENSES = 100

function parseCategoryAssignments(value: unknown): StoreCategoryAssignment[] {
  const input = assertObject(value)
  assertExactKeys(input, ['assignments'])
  if (!Array.isArray(input.assignments)) {
    throw new HttpError('assignmentsが不正です', 400)
  }
  const assignments = input.assignments.map((assignment) => {
    const item = assertObject(assignment)
    assertExactKeys(item, ['expenseIds', 'category', 'expectedLabel'])
    if (!Array.isArray(item.expenseIds)) {
      throw new HttpError('expenseIdsが不正です', 400)
    }
    const expenseIds = item.expenseIds.map((id) => parseString(id, 'expenseIds'))
    const category = parseString(item.category, 'category')
    if (!AI_CATEGORY_SET.has(category)) {
      throw new HttpError('categoryが不正です', 400)
    }
    return {
      expenseIds,
      category,
      expectedLabel: parseString(item.expectedLabel, 'expectedLabel'),
    }
  })
  const expenseCount = assignments.reduce(
    (count, assignment) => count + assignment.expenseIds.length,
    0
  )
  if (expenseCount > MAX_CATEGORY_EXPENSES) {
    throw new HttpError('一度に分類できる支出は100件までです', 400)
  }
  return assignments
}

function parseSaveDiagnosisInput(value: unknown): SaveDiagnosisInput {
  const input = assertObject(value)
  assertExactKeys(input, ['runToken', 'inputHash', 'analysisVersion', 'diagnosis'])
  return {
    runToken: parseString(input.runToken, 'runToken'),
    inputHash: parseString(input.inputHash, 'inputHash'),
    analysisVersion: parseString(input.analysisVersion, 'analysisVersion'),
    diagnosis: parseDiagnosisView(input.diagnosis),
  }
}

function parseDiagnosisView(value: unknown): AiDiagnosisView {
  const input = assertObject(value)
  assertExactKeys(input, [
    'month', 'summaryText', 'currentExpenseTotal', 'baselineExpenseAverage',
    'unresolvedCarryoverTotal', 'notableChanges', 'positivePoints', 'suggestions',
    'dataSufficiency',
  ])
  return {
    month: parseMonth(input.month),
    summaryText: parseString(input.summaryText, 'summaryText'),
    currentExpenseTotal: parseNumber(input.currentExpenseTotal, 'currentExpenseTotal'),
    baselineExpenseAverage: parseNullableNumber(
      input.baselineExpenseAverage,
      'baselineExpenseAverage'
    ),
    unresolvedCarryoverTotal: parseNumber(
      input.unresolvedCarryoverTotal,
      'unresolvedCarryoverTotal'
    ),
    notableChanges: parseDiagnosisViewItems(input.notableChanges, 'notableChanges'),
    positivePoints: parseDiagnosisViewItems(input.positivePoints, 'positivePoints'),
    suggestions: parseDiagnosisViewItems(input.suggestions, 'suggestions'),
    dataSufficiency: parseDataSufficiency(input.dataSufficiency),
  }
}

function parseDiagnosisViewItems(value: unknown, name: string): DiagnosisViewItem[] {
  if (!Array.isArray(value)) throw new HttpError(`${name}が不正です`, 400)
  return value.map((item) => parseDiagnosisViewItem(item))
}

function parseDiagnosisViewItem(value: unknown): DiagnosisViewItem {
  const input = assertObject(value)
  assertExactKeys(input, [
    'id', 'kind', 'category', 'currentAmount', 'baselineAmount', 'differenceAmount',
    'differenceRate', 'potentialAmount', 'contributingLabels', 'isLikelyOneOff',
    'commentary',
  ])
  if (!Array.isArray(input.contributingLabels)) {
    throw new HttpError('contributingLabelsが不正です', 400)
  }
  if (typeof input.isLikelyOneOff !== 'boolean') {
    throw new HttpError('isLikelyOneOffが不正です', 400)
  }
  return {
    id: parseString(input.id, 'id'),
    kind: parseDiagnosisKind(input.kind),
    category: parseAiCategory(input.category),
    currentAmount: parseNumber(input.currentAmount, 'currentAmount'),
    baselineAmount: parseNullableNumber(input.baselineAmount, 'baselineAmount'),
    differenceAmount: parseNumber(input.differenceAmount, 'differenceAmount'),
    differenceRate: parseNullableNumber(input.differenceRate, 'differenceRate'),
    potentialAmount: parseNullableNumber(input.potentialAmount, 'potentialAmount'),
    contributingLabels: input.contributingLabels.map((label) =>
      parseString(label, 'contributingLabels')
    ),
    isLikelyOneOff: input.isLikelyOneOff,
    commentary: parseString(input.commentary, 'commentary'),
  }
}

function parseNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(`${name}が不正です`, 400)
  }
  return value
}

function parseNullableNumber(value: unknown, name: string): number | null {
  return value === null ? null : parseNumber(value, name)
}

function parseAiCategory(value: unknown): AiCategory {
  const category = parseString(value, 'category')
  if (!AI_CATEGORY_SET.has(category)) throw new HttpError('categoryが不正です', 400)
  return category as AiCategory
}

function parseDiagnosisKind(value: unknown): DiagnosisViewItem['kind'] {
  if (value !== 'increase' && value !== 'positive' && value !== 'suggestion') {
    throw new HttpError('kindが不正です', 400)
  }
  return value
}

function parseDataSufficiency(value: unknown): AiDiagnosisView['dataSufficiency'] {
  if (value !== 'current_only' && value !== 'reference' && value !== 'full') {
    throw new HttpError('dataSufficiencyが不正です', 400)
  }
  return value
}
