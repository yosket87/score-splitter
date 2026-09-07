import type { D1DatabaseLike, Runtime } from './d1'
import { HttpError } from './http'
import { assertExistingLoginHousehold, type HouseholdContext } from './households'
import { authOperation } from './google-auth-shared'
import type { ApiSession } from '../../../src/types/auth'
import { assertObject } from './validation'
import { readFirebaseSession } from './firebase-session'

export type AuthMethod = 'password' | 'passkey' | 'google' | 'firebase'

interface SessionRow {
  token: string
  household_id: string
  person: 'husband' | 'wife' | null
  auth_method: AuthMethod
  expires_at: string
  created_at: string
  legacy_auth_disabled_at: string | null
  user_id: string | null
  membership_id: string | null
  session_epoch: number | null
  active: number | null
  current_epoch: number | null
  member_user_id: string | null
  member_household_id: string | null
  revoked_at: string | null
  default_person: 'husband' | 'wife' | null
}

async function createLegacySession(db: D1DatabaseLike, runtime: Runtime, context: HouseholdContext, body: unknown) {
  await assertExistingLoginHousehold(db, context)
  const input = assertObject(body)
  const token = parseToken(input.token)
  const person = input.person === null ? null : parsePerson(input.person)
  const authMethod = parseAuthMethod(input.authMethod)
  const expiresAt = parseDate(input.expiresAt, 'expiresAt')
  const createdAt = runtime.now().toISOString()

  await db
    .prepare(
      'INSERT INTO sessions (token, person, auth_method, expires_at, created_at, household_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(token, person, authMethod, expiresAt, createdAt, context.householdId)
    .run()

  return { token, person, authMethod, expiresAt, householdId: context.householdId }
}

async function readSession(db: D1DatabaseLike, token: string, now: Date = new Date()): Promise<ApiSession | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const row = await db
    .prepare(`SELECT s.*,h.legacy_auth_disabled_at,u.active,u.session_epoch AS current_epoch,
      m.user_id AS member_user_id,m.household_id AS member_household_id,m.revoked_at,m.default_person
      FROM sessions s JOIN households h ON h.id=s.household_id
      LEFT JOIN users u ON u.id=s.user_id LEFT JOIN household_memberships m ON m.id=s.membership_id WHERE s.token=?`)
    .bind(token)
    .first<SessionRow>()
  if (!row || !row.household_id?.trim() ||
    !['password', 'passkey', 'google', 'firebase'].includes(row.auth_method) ||
    !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= now.getTime() ||
    (row.person !== null && row.person !== 'husband' && row.person !== 'wife')) {
    return null
  }
  const base = { token: row.token, householdId: row.household_id, expiresAt: row.expires_at }
  if (row.auth_method === 'firebase') return readFirebaseSession(db, token, now)
  if (row.auth_method === 'google') {
    if (!row.user_id || !row.membership_id || row.active !== 1 || row.revoked_at !== null ||
      row.member_user_id !== row.user_id || row.member_household_id !== row.household_id ||
      row.session_epoch === null || !Number.isSafeInteger(row.session_epoch) || row.session_epoch < 0 ||
      row.current_epoch !== row.session_epoch || !row.default_person) return null
    return { ...base, authMethod: 'google', person: row.default_person, userId: row.user_id, membershipId: row.membership_id, sessionEpoch: row.session_epoch }
  }
  if (row.legacy_auth_disabled_at !== null) return null
  return {
    token: row.token,
    householdId: row.household_id,
    person: row.person,
    authMethod: row.auth_method,
    expiresAt: row.expires_at,
  }
}

async function removeSession(db: D1DatabaseLike, token: string) {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
}

function parseToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new HttpError('tokenが不正です', 400)
  }
  return value
}

function parsePerson(value: unknown): 'husband' | 'wife' {
  if (value !== 'husband' && value !== 'wife') {
    throw new HttpError('personが不正です', 400)
  }
  return value
}

function parseAuthMethod(value: unknown): 'password' | 'passkey' {
  if (value !== 'password' && value !== 'passkey') {
    throw new HttpError('authMethodが不正です', 400)
  }
  return value
}

function parseDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new HttpError(`${name}が不正です`, 400)
  }
  return value
}


export function createSession(db: D1DatabaseLike, runtime: Runtime, context: HouseholdContext, body: unknown) {
  return authOperation(() => createLegacySession(db, runtime, context, body))
}
export function getSession(db: D1DatabaseLike, token: string, now: Date = new Date()) {
  return authOperation(() => readSession(db, token, now))
}
export function deleteSession(db: D1DatabaseLike, token: string) {
  return authOperation(() => removeSession(db, token))
}
