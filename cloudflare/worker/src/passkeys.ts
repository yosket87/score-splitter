import type { D1DatabaseLike, Runtime } from './d1'
import { HttpError } from './http'
import { assertHouseholdContext, type HouseholdContext } from './households'
import {
  assertObject,
  parseInteger,
  parsePerson,
  parseString,
  parseStringArray,
} from './validation'

interface PasskeyRow {
  id: string
  household_id: string
  person: 'husband' | 'wife'
  public_key_base64: string
  counter: number
  device_name: string | null
  transports: string
  created_at: string
}

export async function listPasskeys(db: D1DatabaseLike, context: HouseholdContext, person?: string | null) {
  assertHouseholdContext(context)
  const query = 'SELECT * FROM passkey_credentials WHERE household_id = ?' +
    (person ? ' AND person = ?' : '') + ' ORDER BY created_at ASC'
  const statement = person ? db.prepare(query).bind(context.householdId, person) : db.prepare(query).bind(context.householdId)
  const { results } = await statement.all<PasskeyRow>()
  return results.map(mapPasskey)
}

export async function getPasskey(db: D1DatabaseLike, context: HouseholdContext, id: string) {
  assertHouseholdContext(context)
  const row = await db.prepare('SELECT * FROM passkey_credentials WHERE household_id = ? AND id = ?')
    .bind(context.householdId, id).first<PasskeyRow>()
  return row ? mapPasskey(row) : null
}

// 署名検証用のサーバー内部検索。結果をブラウザへ返さない。
export async function findAuthenticationCredential(db: D1DatabaseLike, id: string) {
  const row = await db.prepare('SELECT p.* FROM passkey_credentials p INNER JOIN households h ON h.id = p.household_id WHERE p.id = ?')
    .bind(id).first<PasskeyRow>()
  return row && row.household_id?.trim() ? mapPasskey(row) : null
}

export async function createPasskey(db: D1DatabaseLike, runtime: Runtime, context: HouseholdContext, body: unknown) {
  assertHouseholdContext(context)
  const input = assertObject(body)
  const id = parseString(input.id, 'id')
  const person = parsePerson(input.person)
  const publicKeyBase64 = parseBase64(input.publicKeyBase64)
  const counter = parseInteger(input.counter, 'counter')
  const deviceName =
    input.deviceName === null || input.deviceName === undefined
      ? null
      : parseString(input.deviceName, 'deviceName')
  const transports = parseStringArray(input.transports ?? [], 'transports')
  const createdAt = runtime.now().toISOString()

  await db
    .prepare(
      'INSERT INTO passkey_credentials (id, person, public_key_base64, counter, device_name, transports, created_at, household_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, person, publicKeyBase64, counter, deviceName, JSON.stringify(transports), createdAt, context.householdId)
    .run()

  return {
    id,
    householdId: context.householdId,
    person,
    publicKeyBase64,
    counter,
    deviceName,
    transports,
    createdAt,
  }
}

export async function updatePasskeyCounter(db: D1DatabaseLike, context: HouseholdContext, id: string, body: unknown) {
  assertHouseholdContext(context)
  const input = assertObject(body)
  const counter = parseInteger(input.counter, 'counter')
  // 同期パスキーの0→0は許可するが、署名検証中に進んだ非ゼロcounterは巻き戻さない。
  const result = await db.prepare(`UPDATE passkey_credentials SET counter = ?
    WHERE household_id = ? AND id = ? AND (counter < ? OR (counter = 0 AND ? = 0))`)
    .bind(counter, context.householdId, id, counter, counter).run()
  if (result.meta?.changes !== 1) throw new HttpError('パスキーの状態が変わりました。再認証してください', 409)
}

export async function deletePasskey(db: D1DatabaseLike, context: HouseholdContext, id: string) {
  assertHouseholdContext(context)
  await db.prepare('DELETE FROM passkey_credentials WHERE household_id = ? AND id = ?').bind(context.householdId, id).run()
}

function mapPasskey(row: PasskeyRow) {
  return {
    id: row.id,
    householdId: row.household_id,
    person: row.person,
    publicKeyBase64: row.public_key_base64,
    counter: row.counter,
    deviceName: row.device_name,
    transports: JSON.parse(row.transports || '[]') as string[],
    createdAt: row.created_at,
  }
}

function parseBase64(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError('publicKeyBase64が不正です', 400)
  }
  return value
}
