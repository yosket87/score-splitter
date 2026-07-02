import { copyMonthData, getCopyMonthPreview } from './copy-month'
import { createRuntime, type Env, type RuntimeDeps } from './d1'
import { assertAuth, errorJson, HttpError, json, readJson } from './http'
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
import { parseMonth } from './validation'

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
    assertAuth(request, env.WORKER_API_TOKEN)
    const runtime = createRuntime(deps)
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)

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
