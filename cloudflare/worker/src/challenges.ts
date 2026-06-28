import type { D1DatabaseLike, Runtime } from './d1'
import { assertObject, parseNullablePerson, parseString } from './validation'

type ChallengeType = 'registration' | 'authentication'

interface ChallengeRow {
  id: string
  challenge: string
  type: ChallengeType
  person: 'husband' | 'wife' | null
  expires_at: string
  created_at: string
}

export async function createChallenge(db: D1DatabaseLike, runtime: Runtime, body: unknown) {
  const input = assertObject(body)
  const id = runtime.randomUUID()
  const challenge = parseString(input.challenge, 'challenge')
  const type = parseChallengeType(input.type)
  const person = parseNullablePerson(input.person)
  const expiresAt = parseDate(input.expiresAt)
  const createdAt = runtime.now().toISOString()

  await db
    .prepare(
      'INSERT INTO webauthn_challenges (id, challenge, type, person, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(id, challenge, type, person, expiresAt, createdAt)
    .run()

  return {
    id,
    challenge,
    type,
    person,
    expiresAt,
    createdAt,
  }
}

export async function getLatestChallenge(
  db: D1DatabaseLike,
  type: ChallengeType,
  person: string | null
) {
  const base =
    'SELECT * FROM webauthn_challenges WHERE type = ? AND ' +
    (person ? 'person = ?' : 'person IS NULL') +
    ' ORDER BY created_at DESC LIMIT 1'
  const statement = person ? db.prepare(base).bind(type, person) : db.prepare(base).bind(type)
  const row = await statement.first<ChallengeRow>()
  return row ? mapChallenge(row) : null
}

export async function deleteChallenges(
  db: D1DatabaseLike,
  type: ChallengeType,
  person: string | null
) {
  const query = person
    ? 'DELETE FROM webauthn_challenges WHERE type = ? AND person = ?'
    : 'DELETE FROM webauthn_challenges WHERE type = ? AND person IS NULL'
  const statement = person ? db.prepare(query).bind(type, person) : db.prepare(query).bind(type)
  await statement.run()
}

export async function deleteExpiredChallenges(db: D1DatabaseLike, before: string) {
  await db.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(before).run()
}

export function parseChallengeType(value: unknown): ChallengeType {
  if (value !== 'registration' && value !== 'authentication') {
    throw new Error('typeが不正です')
  }
  return value
}

function parseDate(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('expiresAtが不正です')
  }
  return value
}

function mapChallenge(row: ChallengeRow) {
  return {
    id: row.id,
    challenge: row.challenge,
    type: row.type,
    person: row.person,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}
