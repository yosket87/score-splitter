import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import { applyOrder, deleteRows, getTable, insertRows, updateRows } from './db'

export const MOCK_LEGACY_HOUSEHOLD_ID = '3975b870-bbfa-49fd-ae3d-d273c9f6e107'
type Row = Record<string, unknown>
const person = z.enum(['husband', 'wife'])
const expiry = z.string().refine((value) => Number.isFinite(Date.parse(value)))
const sessionInput = z.object({ householdId: z.string().min(1), token: z.string().regex(/^[a-f0-9]{64}$/), person: person.nullable(), authMethod: z.enum(['password', 'passkey']), expiresAt: expiry })
const passkeyInput = z.object({ id: z.string().min(1), person, publicKeyBase64: z.string().min(1), counter: z.number().int(), deviceName: z.string().nullable().optional(), transports: z.array(z.string()).default([]) })
const challengeInput = z.object({ challenge: z.string().min(1), person: person.nullable(), expiresAt: expiry })

function householdExists(id: unknown) {
  return typeof id === 'string' && id.trim() !== '' && getTable('households').some((row) => row.id === id)
}
function legacyHousehold() {
  return getTable('households').find((row) => row.legacy_auth_key === 'legacy')
}
export function validSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const row = getTable('sessions').find((item) => item.token === token)
  if (!row || !householdExists(row.household_id) || !['password', 'passkey'].includes(String(row.auth_method)) ||
    ![null, 'husband', 'wife'].includes(row.person as string | null) ||
    !Number.isFinite(Date.parse(String(row.expires_at))) || Date.parse(String(row.expires_at)) <= Date.now()) return null
  return row
}
function apiSession(row: Row) {
  return { token: row.token, householdId: row.household_id, person: row.person, authMethod: row.auth_method, expiresAt: row.expires_at }
}
function apiPasskey(row: Row) {
  return { id: row.id, householdId: row.household_id, person: row.person, publicKeyBase64: row.public_key_base64, counter: row.counter,
    deviceName: row.device_name, transports: Array.isArray(row.transports) ? row.transports : JSON.parse(String(row.transports || '[]')), createdAt: row.created_at }
}
function apiChallenge(row: Row) {
  return { id: row.id, householdId: row.household_id, challenge: row.challenge, type: row.type, person: row.person, expiresAt: row.expires_at, createdAt: row.created_at }
}
const data = (value: unknown, status = 200) => HttpResponse.json({ data: value }, { status })
const success = () => HttpResponse.json({ success: true })
const unauthorized = () => HttpResponse.json({ error: '認証に失敗しました' }, { status: 401 })
const notFound = () => HttpResponse.json({ error: 'エンドポイントが見つかりません' }, { status: 404 })

export function createAuthHandlers(baseUrl: string, token: string) {
  const handler = async (request: Request) => {
    if (request.headers.get('authorization') !== `Bearer ${token}`) return unauthorized()
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (parts[0] === 'internal' && parts[1] === 'auth') return await internal(request, parts.slice(2))
      const session = validSession(request.headers.get('x-household-session') ?? '')
      if (!session) return unauthorized()
      const householdId = String(session.household_id)
      if (parts[0] === 'webauthn-challenges') return await challenges(request, parts.slice(1), householdId)
      const id = parts[1]
      const rows = getTable('passkey_credentials').filter((row) => row.household_id === householdId)
      if (!id && request.method === 'GET') {
        const selectedPerson = url.searchParams.get('person')
        return data(applyOrder(rows.filter((row) => !selectedPerson || row.person === selectedPerson), 'created_at.asc').map(apiPasskey))
      }
      if (!id && request.method === 'POST') {
        const input = passkeyInput.parse(await request.json())
        if (getTable('passkey_credentials').some((row) => row.id === input.id)) return HttpResponse.json({ error: '登録済みです' }, { status: 409 })
        const row = insertRows('passkey_credentials', [{ id: input.id, household_id: householdId, person: input.person,
          public_key_base64: input.publicKeyBase64, counter: input.counter, device_name: input.deviceName ?? null, transports: JSON.stringify(input.transports) }])[0]
        return data(apiPasskey(row), 201)
      }
      if (id && request.method === 'GET') {
        const row = rows.find((row) => row.id === id)
        return data(row ? apiPasskey(row) : null)
      }
      if (id && request.method === 'DELETE') {
        deleteRows('passkey_credentials', { id: `eq.${id}`, household_id: `eq.${householdId}` })
        return success()
      }
      return notFound()
    } catch {
      return HttpResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 })
    }
  }
  return [
    http.all(`${baseUrl}/internal/auth/*`, ({ request }) => handler(request)),
    http.all(`${baseUrl}/passkeys`, ({ request }) => handler(request)),
    http.all(`${baseUrl}/passkeys/*`, ({ request }) => handler(request)),
    http.all(`${baseUrl}/webauthn-challenges`, ({ request }) => handler(request)),
    http.all(`${baseUrl}/webauthn-challenges/*`, ({ request }) => handler(request)),
  ]
}

async function internal(request: Request, [resource, id, action]: string[]) {
  if (resource === 'legacy-household' && request.method === 'GET') {
    const row = legacyHousehold()
    return row ? data({ householdId: row.id }) : unauthorized()
  }
  if (resource === 'sessions') {
    if (!id && request.method === 'POST') {
      const input = sessionInput.parse(await request.json())
      if (input.householdId !== legacyHousehold()?.id) return unauthorized()
      const row = insertRows('sessions', [{ token: input.token, household_id: input.householdId, person: input.person,
        auth_method: input.authMethod, expires_at: input.expiresAt }])[0]
      return data(apiSession(row), 201)
    }
    if (id && request.method === 'GET') {
      const row = validSession(id)
      return data(row ? apiSession(row) : null)
    }
    if (id && request.method === 'DELETE') {
      deleteRows('sessions', { token: `eq.${id}` })
      return success()
    }
  }
  if (resource === 'credentials' && id) {
    if (request.method === 'GET') {
      const row = getTable('passkey_credentials').find((row) => row.id === id && householdExists(row.household_id))
      return data(row ? apiPasskey(row) : null)
    }
    if (request.method === 'PATCH') {
      const input = z.object({ householdId: z.string().trim().min(1), counter: z.number().int() }).parse(await request.json())
      const updated = updateRows('passkey_credentials', { id: `eq.${id}`, household_id: `eq.${input.householdId}`, counter: input.counter === 0 ? 'eq.0' : `lt.${input.counter}` }, { counter: input.counter })
      if (updated.length !== 1) return HttpResponse.json({ error: 'パスキーの状態が変わりました。再認証してください' }, { status: 409 })
      return success()
    }
  }
  if (resource === 'challenges') {
    if (id === 'expired' && request.method === 'DELETE') {
      const input = z.object({ before: expiry }).parse(await request.json())
      for (const row of [...getTable('webauthn_challenges')]) {
        if (String(row.expires_at) <= input.before) deleteRows('webauthn_challenges', { id: `eq.${row.id}` })
      }
      return success()
    }
    return challenges(request, [id, action], null)
  }
  return notFound()
}

async function challenges(request: Request, [id, action]: string[], householdId: string | null) {
  if (request.method !== 'POST') return notFound()
  const type = householdId === null ? 'authentication' : 'registration'
  if (!id) {
    const input = challengeInput.parse(await request.json())
    if (householdId === null ? input.person !== null : input.person === null) throw new Error('personが不正です')
    const row = insertRows('webauthn_challenges', [{ challenge: input.challenge, household_id: householdId, type, person: input.person, expires_at: input.expiresAt }])[0]
    return data(apiChallenge(row), 201)
  }
  if (action === 'consume') {
    const input = z.object({ person: person.nullable() }).parse(await request.json())
    const row = getTable('webauthn_challenges').find((row) => row.id === id && row.type === type && row.household_id === householdId && row.person === input.person && Date.parse(String(row.expires_at)) > Date.now())
    // awaitを挟まず、取得と削除を同じ同期区間で行う。
    if (row) deleteRows('webauthn_challenges', { id: `eq.${id}` })
    return data(row ? apiChallenge(row) : null)
  }
  return notFound()
}
