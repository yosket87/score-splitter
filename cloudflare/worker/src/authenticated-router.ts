import { routePaymentStatus } from './payment-router'
import { copyMonthData, getCopyMonthPreview } from './copy-month'
import type { WorkerRouteContext } from './ai-diagnosis-router'
import { json, readJson } from './http'
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
import { parseMonth } from './validation'

export async function routeAuthenticated(
  context: WorkerRouteContext
): Promise<Response | null> {
  return (
    (await routePaymentStatus(context)) ??
    (await routeRecordCollection(context)) ??
    (await routeRecordItem(context)) ??
    (await routeRecordExtras(context)) ??
    (await routeCopyMonth(context)) ??
    (await routeSessions(context)) ??
    (await routePasskeys(context)) ??
    (await routeChallenges(context)) ??
    (await routeLoginAttempts(context))
  )
}

async function routeRecordCollection({ request, env, runtime, url, parts }: WorkerRouteContext) {
  if (parts.length !== 1 || !isRecordPath(parts[0])) return null
  const type = recordTypeFromPath(parts[0])
  if (request.method === 'GET') {
    const month = parseMonth(url.searchParams.get('month'))
    return json({ data: await listRecordsByMonth(env.DB, type, month) })
  }
  if (request.method === 'POST') {
    const data = await createRecord(env.DB, runtime, type, await readJson(request))
    return json({ data }, { status: 201 })
  }
  return null
}

async function routeRecordItem({ request, env, runtime, parts }: WorkerRouteContext) {
  if (parts.length !== 2 || !isRecordPath(parts[0])) return null
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
  return null
}

async function routeRecordExtras(context: WorkerRouteContext) {
  const { request, env, runtime, parts } = context
  if (parts.length === 3 && request.method === 'PATCH') {
    const flagType = getFlagType(parts)
    if (flagType) {
      await patchRecordFlag(
        env.DB,
        runtime,
        flagType,
        decodeURIComponent(parts[1]),
        await readJson(request)
      )
      return json({ success: true })
    }
  }
  if (parts.length === 1 && parts[0] === 'monthly-amounts' && request.method === 'GET') {
    return json({ data: await listMonthlyAmounts(env.DB) })
  }
  return null
}

function getFlagType(parts: string[]): 'expense' | 'carryover' | null {
  if (parts[0] === 'expenses' && parts[2] === 'carryover') return 'expense'
  if (parts[0] === 'carryovers' && parts[2] === 'cleared') return 'carryover'
  return null
}

async function routeCopyMonth({ request, env, runtime, url, parts }: WorkerRouteContext) {
  if (parts[0] !== 'copy-month') return null
  if (parts.length === 2 && parts[1] === 'preview' && request.method === 'GET') {
    const sourceMonth = parseMonth(url.searchParams.get('sourceMonth'))
    const targetMonth = parseMonth(url.searchParams.get('targetMonth'))
    return json({ data: await getCopyMonthPreview(env.DB, sourceMonth, targetMonth) })
  }
  if (parts.length === 1 && request.method === 'POST') {
    return json(await copyMonthData(env.DB, runtime, await readJson(request)))
  }
  return null
}

async function routeSessions({ request, env, runtime, parts }: WorkerRouteContext) {
  if (parts[0] !== 'sessions') return null
  if (parts.length === 1 && request.method === 'POST') {
    const data = await createSession(env.DB, runtime, await readJson(request))
    return json({ data }, { status: 201 })
  }
  if (parts.length !== 2) return null
  const token = decodeURIComponent(parts[1])
  if (request.method === 'GET') return json({ data: await getSession(env.DB, token) })
  if (request.method === 'DELETE') {
    await deleteSession(env.DB, token)
    return json({ success: true })
  }
  return null
}

async function routePasskeys({ request, env, runtime, url, parts }: WorkerRouteContext) {
  if (parts[0] !== 'passkeys') return null
  if (parts.length === 1 && request.method === 'GET') {
    return json({ data: await listPasskeys(env.DB, url.searchParams.get('person')) })
  }
  if (parts.length === 1 && request.method === 'POST') {
    const data = await createPasskey(env.DB, runtime, await readJson(request))
    return json({ data }, { status: 201 })
  }
  if (parts.length !== 2) return null
  const id = decodeURIComponent(parts[1])
  if (request.method === 'GET') return json({ data: await getPasskey(env.DB, id) })
  if (request.method === 'PATCH') {
    await updatePasskeyCounter(env.DB, id, await readJson(request))
    return json({ success: true })
  }
  if (request.method === 'DELETE') {
    await deletePasskey(env.DB, id)
    return json({ success: true })
  }
  return null
}

async function routeChallenges({ request, env, runtime, url, parts }: WorkerRouteContext) {
  if (parts[0] !== 'webauthn-challenges') return null
  if (parts.length === 1 && request.method === 'POST') {
    const data = await createChallenge(env.DB, runtime, await readJson(request))
    return json({ data }, { status: 201 })
  }
  const type = url.searchParams.get('type')
  const person = url.searchParams.get('person')
  if (parts.length === 1 && request.method === 'DELETE') {
    await deleteChallenges(env.DB, parseChallengeType(type), person)
    return json({ success: true })
  }
  if (parts.length === 2 && parts[1] === 'latest' && request.method === 'GET') {
    return json({ data: await getLatestChallenge(env.DB, parseChallengeType(type), person) })
  }
  if (parts.length === 2 && parts[1] === 'expired' && request.method === 'DELETE') {
    await deleteExpiredChallenges(
      env.DB,
      url.searchParams.get('before') ?? runtime.now().toISOString()
    )
    return json({ success: true })
  }
  return null
}

async function routeLoginAttempts({ request, env, runtime, parts }: WorkerRouteContext) {
  if (parts.length !== 2 || parts[0] !== 'login-attempts' || request.method !== 'POST') {
    return null
  }
  const input = await readJson(request)
  if (parts[1] === 'check') {
    return json({ data: await checkLoginRateLimit(env.DB, runtime, input) })
  }
  if (parts[1] === 'failure') {
    return json({ data: await recordFailedLoginAttempt(env.DB, runtime, input) })
  }
  if (parts[1] === 'reset') {
    await resetLoginAttempts(env.DB, input)
    return json({ success: true })
  }
  return null
}

function isRecordPath(path: string): path is 'incomes' | 'expenses' | 'carryovers' {
  return path === 'incomes' || path === 'expenses' || path === 'carryovers'
}

function recordTypeFromPath(path: 'incomes' | 'expenses' | 'carryovers') {
  if (path === 'expenses') return 'expense'
  if (path === 'carryovers') return 'carryover'
  return 'income'
}
