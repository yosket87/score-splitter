import type { D1DatabaseLike, Runtime } from './d1'
import { assertObject } from './validation'

export type AuthMethod = 'password' | 'passkey'

interface SessionRow {
  token: string
  person: 'husband' | 'wife' | null
  auth_method: AuthMethod
  expires_at: string
  created_at: string
}

export async function createSession(db: D1DatabaseLike, runtime: Runtime, body: unknown) {
  const input = assertObject(body)
  const token = parseToken(input.token)
  const person = input.person === null ? null : parsePerson(input.person)
  const authMethod = parseAuthMethod(input.authMethod)
  const expiresAt = parseDate(input.expiresAt, 'expiresAt')
  const createdAt = runtime.now().toISOString()

  await db
    .prepare(
      'INSERT INTO sessions (token, person, auth_method, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(token, person, authMethod, expiresAt, createdAt)
    .run()

  return { token, person, authMethod, expiresAt }
}

export async function getSession(db: D1DatabaseLike, token: string) {
  const row = await db
    .prepare('SELECT token, person, auth_method, expires_at, created_at FROM sessions WHERE token = ?')
    .bind(token)
    .first<SessionRow>()
  if (!row) {
    return null
  }
  return {
    token: row.token,
    person: row.person,
    authMethod: row.auth_method,
    expiresAt: row.expires_at,
  }
}

export async function deleteSession(db: D1DatabaseLike, token: string) {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
}

function parseToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('tokenが不正です')
  }
  return value
}

function parsePerson(value: unknown): 'husband' | 'wife' {
  if (value !== 'husband' && value !== 'wife') {
    throw new Error('personが不正です')
  }
  return value
}

function parseAuthMethod(value: unknown): AuthMethod {
  if (value !== 'password' && value !== 'passkey') {
    throw new Error('authMethodが不正です')
  }
  return value
}

function parseDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name}が不正です`)
  }
  return value
}
