import type { WorkerRouteContext } from './ai-diagnosis-router'
import { json, readJson, HttpError } from './http'
import { createSession, getSession, deleteSession } from './sessions'
import { getLegacyHouseholdContext, assertHouseholdContext } from './households'
import { createPasskey, getPasskey, findAuthenticationCredential, listPasskeys, deletePasskey, updatePasskeyCounter } from './passkeys'
import { createChallenge, consumeChallenge, deleteExpiredChallenges, type ChallengeScope } from './challenges'
import { assertObject, parseNullablePerson, parseString } from './validation'

// index.tsのBearer検証後のみ到達するサーバー内部control-plane。
// body.householdIdは署名/bcryptを検証済みのサーバーが指定する。管理系・家計系には流用しない。
export async function routeAuthControlPlane(context: WorkerRouteContext): Promise<Response | null> {
  const { request, env, runtime, parts } = context
  if (parts[0] !== 'internal' || parts[1] !== 'auth') return null
  const [resource, id, action] = parts.slice(2)
  if (resource === 'legacy-household' && request.method === 'GET') {
    return json({ data: await getLegacyHouseholdContext(env.DB) })
  }
  if (resource === 'sessions') {
    if (!id && request.method === 'POST') {
      const input = assertObject(await readJson(request))
      const household = { householdId: input.householdId }
      assertHouseholdContext(household)
      return json({ data: await createSession(env.DB, runtime, household, input) }, { status: 201 })
    }
    if (id && request.method === 'GET') return json({ data: await getSession(env.DB, decodeURIComponent(id), runtime.now()) })
    if (id && request.method === 'DELETE') {
      await deleteSession(env.DB, decodeURIComponent(id))
      return json({ success: true })
    }
  }
  if (resource === 'credentials' && id) {
    if (request.method === 'GET') return json({ data: await findAuthenticationCredential(env.DB, decodeURIComponent(id)) })
    if (request.method === 'PATCH') {
      const input = assertObject(await readJson(request))
      const household = { householdId: input.householdId }
      assertHouseholdContext(household)
      await updatePasskeyCounter(env.DB, household, decodeURIComponent(id), input)
      return json({ success: true })
    }
  }
  if (resource === 'challenges') {
    if (id === 'expired' && request.method === 'DELETE') {
      const input = assertObject(await readJson(request))
      await deleteExpiredChallenges(env.DB, parseString(input.before, 'before'))
      return json({ success: true })
    }
    return routeChallenge(context, { type: 'authentication' }, id, action)
  }
  return null
}

export async function routeAuthManagement(context: WorkerRouteContext): Promise<Response | null> {
  const { request, env, runtime, url, parts } = context
  if (parts[0] !== 'passkeys' && parts[0] !== 'webauthn-challenges') return null
  const session = await getSession(env.DB, request.headers.get('x-household-session') ?? '', runtime.now())
  if (!session) throw new HttpError('認証が必要です', 401)
  const household = Object.freeze({ householdId: session.householdId })
  const id = parts[1] ? decodeURIComponent(parts[1]) : undefined
  if (parts[0] === 'webauthn-challenges') {
    return routeChallenge(context, { type: 'registration', context: household }, id, parts[2])
  }
  if (!id && request.method === 'GET') return json({ data: await listPasskeys(env.DB, household, url.searchParams.get('person')) })
  if (!id && request.method === 'POST') {
    return json({ data: await createPasskey(env.DB, runtime, household, await readJson(request)) }, { status: 201 })
  }
  if (id && request.method === 'GET') return json({ data: await getPasskey(env.DB, household, id) })
  if (id && request.method === 'DELETE') {
    await deletePasskey(env.DB, household, id)
    return json({ success: true })
  }
  return null
}

async function routeChallenge({ request, env, runtime }: WorkerRouteContext, scope: ChallengeScope, id?: string, action?: string) {
  if (request.method !== 'POST') return null
  const input = assertObject(await readJson(request))
  if (!id) return json({ data: await createChallenge(env.DB, runtime, scope, input) }, { status: 201 })
  if (action === 'consume') {
    return json({ data: await consumeChallenge(env.DB, runtime, scope, decodeURIComponent(id), parseNullablePerson(input.person)) })
  }
  return null
}
