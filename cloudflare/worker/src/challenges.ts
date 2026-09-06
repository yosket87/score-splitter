import type { D1DatabaseLike, Runtime } from './d1'
import { HttpError } from './http'
import { assertHouseholdContext, type HouseholdContext } from './households'
import { assertObject, parsePerson, parseString } from './validation'

export type ChallengeScope =
  | Readonly<{ type: 'registration'; context: HouseholdContext }>
  | Readonly<{ type: 'authentication' }>

interface ChallengeRow {
  id: string
  household_id: string | null
  challenge: string
  type: 'registration' | 'authentication'
  person: 'husband' | 'wife' | null
  expires_at: string
  created_at: string
}

function scopeHousehold(scope: ChallengeScope) {
  if (scope.type === 'authentication') return null
  if (scope.type !== 'registration') throw new HttpError('typeが不正です', 400)
  assertHouseholdContext(scope.context)
  return scope.context.householdId
}

function scopePerson(scope: ChallengeScope, person: unknown) {
  if (scope.type === 'registration') return parsePerson(person)
  if (person !== null) throw new HttpError('認証前challengeのpersonはNULLです', 400)
  return null
}

export async function createChallenge(db: D1DatabaseLike, runtime: Runtime, scope: ChallengeScope, body: unknown) {
  const householdId = scopeHousehold(scope)
  const input = assertObject(body)
  const id = runtime.randomUUID()
  const challenge = parseString(input.challenge, 'challenge')
  const person = scopePerson(scope, input.person)
  const expiresAt = parseString(input.expiresAt, 'expiresAt')
  if (!Number.isFinite(Date.parse(expiresAt))) throw new HttpError('expiresAtが不正です', 400)
  const createdAt = runtime.now().toISOString()
  await db.prepare('INSERT INTO webauthn_challenges (id, challenge, type, person, expires_at, created_at, household_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, challenge, scope.type, person, expiresAt, createdAt, householdId).run()
  return { id, challenge, type: scope.type, person, expiresAt, createdAt, householdId }
}

// 取得と削除を単一SQLにし、同じブラウザ試行からの二重検証を拒否する。
export async function consumeChallenge(db: D1DatabaseLike, runtime: Runtime, scope: ChallengeScope, id: string, person: 'husband' | 'wife' | null) {
  const householdId = scopeHousehold(scope)
  const scopedPerson = scopePerson(scope, person)
  const row = await db.prepare(`DELETE FROM webauthn_challenges
    WHERE id = ? AND type = ? AND household_id IS ? AND person IS ?
      AND julianday(expires_at) > julianday(?) RETURNING *`)
    .bind(id, scope.type, householdId, scopedPerson, runtime.now().toISOString()).first<ChallengeRow>()
  return row ? {
    id: row.id, challenge: row.challenge, type: row.type, person: row.person,
    expiresAt: row.expires_at, createdAt: row.created_at, householdId: row.household_id,
  } : null
}

export async function deleteExpiredChallenges(db: D1DatabaseLike, before: string) {
  await db.prepare('DELETE FROM webauthn_challenges WHERE expires_at <= ?').bind(before).run()
}
