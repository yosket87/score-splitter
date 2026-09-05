import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthSqlite } from '../../helpers/auth-sqlite'
import { createRuntime } from '../../../cloudflare/worker/src/d1'
import { assertHouseholdContext, getLegacyHouseholdContext, assertExistingLoginHousehold } from '../../../cloudflare/worker/src/households'
import { createSession, getSession } from '../../../cloudflare/worker/src/sessions'
import { createPasskey, getPasskey, findAuthenticationCredential, listPasskeys, deletePasskey, updatePasskeyCounter } from '../../../cloudflare/worker/src/passkeys'
import { createChallenge, consumeChallenge } from '../../../cloudflare/worker/src/challenges'

const A = { householdId: 'A' }, B = { householdId: 'B' }
const now = new Date('2026-09-05T00:00:00.000Z')
const expiresAt = '2026-09-05T00:05:00.000Z'
const runtime = createRuntime({ now: () => now })
let state: ReturnType<typeof createAuthSqlite>
beforeEach(() => { state = createAuthSqlite() })
afterEach(() => state.sqlite.close())

describe('世帯認証の実SQLite境界', () => {
  it.each([undefined, null, {}, { householdId: '' }, { householdId: '  ' }])('context欠落を拒否する: %j', (value) => {
    expect(() => assertHouseholdContext(value)).toThrow()
  })
  it('legacy世帯を明示解決し、新規Bログインを許可しない', async () => {
    await expect(getLegacyHouseholdContext(state.db)).resolves.toEqual(A)
    await expect(assertExistingLoginHousehold(state.db, B)).rejects.toThrow()
    state.sqlite.exec('DELETE FROM households WHERE id = \'A\'')
    await expect(getLegacyHouseholdContext(state.db)).rejects.toThrow()
  })
  it.each(['A', 'B'])('実在する世帯%sのsessionから所属を解決する', async (householdId) => {
    const token = 'a'.repeat(64)
    state.sqlite.prepare('INSERT INTO sessions VALUES (?, NULL, ?, ?, ?, ?)').run(token, 'password', expiresAt, now.toISOString(), householdId)
    await expect(getSession(state.db, token, now)).resolves.toMatchObject({ householdId })
  })
  it.each([
    [null, 'password', expiresAt], ['unknown', 'password', expiresAt],
    ['A', 'unknown', expiresAt], ['A', 'password', 'invalid'],
    ['A', 'password', now.toISOString()], ['A', 'password', '2026-09-04T23:59:59.999Z'],
  ])('不正sessionを拒否する %j %j %j', async (household, method, expiry) => {
    const token = 'a'.repeat(64)
    state.sqlite.prepare('INSERT INTO sessions VALUES (?, NULL, ?, ?, ?, ?)').run(token, method, expiry, now.toISOString(), household)
    await expect(getSession(state.db, token, now)).resolves.toBeNull()
  })
  it('session作成に世帯を必須とし保存する', async () => {
    await expect(createSession(state.db, runtime, A, { token: 'a'.repeat(64), person: null, authMethod: 'password', expiresAt })).resolves.toMatchObject(A)
    await expect(createSession(state.db, runtime, B, { token: 'b'.repeat(64), person: null, authMethod: 'password', expiresAt })).rejects.toThrow()
  })
  it('別世帯の同personパスキー管理を分離し認証前検索は所属をJOIN検証する', async () => {
    const input = { id: 'a', person: 'wife', publicKeyBase64: 'AQID', counter: 0 }
    await createPasskey(state.db, runtime, A, input)
    await createPasskey(state.db, runtime, B, { ...input, id: 'b' })
    expect(await listPasskeys(state.db, A, 'wife')).toHaveLength(1)
    expect(await getPasskey(state.db, A, 'b')).toBeNull()
    await deletePasskey(state.db, A, 'b')
    await expect(updatePasskeyCounter(state.db, A, 'b', { counter: 10 })).rejects.toThrow()
    expect(await getPasskey(state.db, B, 'b')).toMatchObject({ counter: 0 })
    expect(await findAuthenticationCredential(state.db, 'b')).toMatchObject(B)
    state.sqlite.exec("UPDATE passkey_credentials SET household_id = NULL WHERE id = 'b'")
    expect(await findAuthenticationCredential(state.db, 'b')).toBeNull()
  })
  it('登録challengeは世帯/person/IDで試行を独立させ一回だけ消費する', async () => {
    const input = { challenge: 'test', person: 'wife', expiresAt }
    const a = await createChallenge(state.db, runtime, { type: 'registration', context: A }, input)
    const b = await createChallenge(state.db, runtime, { type: 'registration', context: B }, input)
    const scope = { type: 'registration' as const, context: A }
    expect(await consumeChallenge(state.db, runtime, scope, b.id, 'wife')).toBeNull()
    expect(await consumeChallenge(state.db, runtime, scope, a.id, 'husband')).toBeNull()
    const results = await Promise.all([consumeChallenge(state.db, runtime, scope, a.id, 'wife'), consumeChallenge(state.db, runtime, scope, a.id, 'wife')])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await consumeChallenge(state.db, runtime, { type: 'registration', context: B }, b.id, 'wife')).toMatchObject(B)
  })
  it('認証前challengeはNULL所属でIDに紐付け、期限一致や種別違いでは消費できない', async () => {
    const scope = { type: 'authentication' as const }
    const a = await createChallenge(state.db, runtime, scope, { challenge: 'a', person: null, expiresAt })
    const b = await createChallenge(state.db, runtime, scope, { challenge: 'b', person: null, expiresAt: now.toISOString() })
    expect(a.householdId).toBeNull()
    expect(await consumeChallenge(state.db, runtime, { type: 'registration', context: A }, a.id, 'wife')).toBeNull()
    expect(await consumeChallenge(state.db, runtime, scope, 'different-browser', null)).toBeNull()
    expect(await consumeChallenge(state.db, runtime, scope, b.id, null)).toBeNull()
    expect(await consumeChallenge(state.db, runtime, scope, a.id, null)).toMatchObject({ challenge: 'a', householdId: null })
    expect(await consumeChallenge(state.db, runtime, scope, a.id, null)).toBeNull()
  })
})

it('並行認証で遅れて届いたcounterが保存済み値を巻き戻さない', async () => {
  await createPasskey(state.db, runtime, A, { id: 'counter', person: 'wife', publicKeyBase64: 'AQID', counter: 1 })
  const results = await Promise.allSettled([updatePasskeyCounter(state.db, A, 'counter', { counter: 3 }), updatePasskeyCounter(state.db, A, 'counter', { counter: 2 })])
  expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'rejected'])
  expect(await getPasskey(state.db, A, 'counter')).toMatchObject({ counter: 3 })
})

it('同期パスキーのcounter 0→0を拒否せず維持する', async () => {
  await createPasskey(state.db, runtime, A, { id: 'synced', person: 'wife', publicKeyBase64: 'AQID', counter: 0 })
  await expect(updatePasskeyCounter(state.db, A, 'synced', { counter: 0 })).resolves.toBeUndefined()
  expect(await getPasskey(state.db, A, 'synced')).toMatchObject({ counter: 0 })
})
