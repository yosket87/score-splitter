import type { D1DatabaseLike, Runtime } from './d1'
import { HttpError } from './http'
import {
  assertObject,
  parseInteger,
  parsePerson,
  parseString,
  parseStringArray,
} from './validation'

interface PasskeyRow {
  id: string
  person: 'husband' | 'wife'
  public_key_base64: string
  counter: number
  device_name: string | null
  transports: string
  created_at: string
}

export async function listPasskeys(db: D1DatabaseLike, person?: string | null) {
  const query = person
    ? 'SELECT * FROM passkey_credentials WHERE person = ? ORDER BY created_at ASC'
    : 'SELECT * FROM passkey_credentials ORDER BY created_at ASC'
  const statement = person ? db.prepare(query).bind(person) : db.prepare(query)
  const { results } = await statement.all<PasskeyRow>()
  return results.map(mapPasskey)
}

export async function getPasskey(db: D1DatabaseLike, id: string) {
  const row = await db
    .prepare('SELECT * FROM passkey_credentials WHERE id = ?')
    .bind(id)
    .first<PasskeyRow>()
  return row ? mapPasskey(row) : null
}

export async function createPasskey(db: D1DatabaseLike, runtime: Runtime, body: unknown) {
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
      'INSERT INTO passkey_credentials (id, person, public_key_base64, counter, device_name, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, person, publicKeyBase64, counter, deviceName, JSON.stringify(transports), createdAt)
    .run()

  return {
    id,
    person,
    publicKeyBase64,
    counter,
    deviceName,
    transports,
    createdAt,
  }
}

export async function updatePasskeyCounter(db: D1DatabaseLike, id: string, body: unknown) {
  const input = assertObject(body)
  const counter = parseInteger(input.counter, 'counter')
  await db.prepare('UPDATE passkey_credentials SET counter = ? WHERE id = ?').bind(counter, id).run()
}

export async function deletePasskey(db: D1DatabaseLike, id: string) {
  await db.prepare('DELETE FROM passkey_credentials WHERE id = ?').bind(id).run()
}

function mapPasskey(row: PasskeyRow) {
  return {
    id: row.id,
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
