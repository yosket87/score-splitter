import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthSqlite } from '../../helpers/auth-sqlite'
import { handleRequest } from '../../../cloudflare/worker/src/index'
const now = new Date('2026-09-05T00:00:00.000Z')
const expiresAt = '2026-09-05T00:05:00.000Z'
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64)
let state: ReturnType<typeof createAuthSqlite>
async function request(path: string, method = 'GET', body?: unknown, token?: string, bearer = true) {
  return handleRequest(new Request(`http://worker.test${path}`, {
    method, headers: { ...(bearer ? { authorization: 'Bearer secret' } : {}), ...(token ? { 'x-household-session': token } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { DB: state.db, WORKER_API_TOKEN: 'secret' }, { now: () => now })
}
beforeEach(() => {
  state = createAuthSqlite()
  for (const [token, household] of [[tokenA, 'A'], [tokenB, 'B']]) {
    state.sqlite.prepare('INSERT INTO sessions VALUES (?, NULL, ?, ?, ?, ?)').run(token, 'password', expiresAt, now.toISOString(), household)
  }
})
afterEach(() => state.sqlite.close())

describe('HTTP認証管理と内部control-plane', () => {
  it.each(['/internal/auth/legacy-household', '/internal/auth/sessions', '/internal/auth/credentials/id', '/internal/auth/challenges', '/passkeys', '/webauthn-challenges'])('外部ブラウザは%sへアクセスできない', async (path) => {
    expect((await request(path, 'GET', undefined, undefined, false)).status).toBe(401)
  })
  it.each(['/passkeys', '/webauthn-challenges'])('Bearerだけでは管理%sへ入れない', async (path) => {
    expect((await request(path, 'GET')).status).toBe(401)
  })
  it('内部session発行/読取/削除は世帯を必須とし、新規Bログインを拒否する', async () => {
    const input = { token: 'c'.repeat(64), person: 'wife', authMethod: 'passkey', expiresAt }
    expect((await request('/internal/auth/sessions', 'POST', input)).status).toBe(401)
    expect((await request('/internal/auth/sessions', 'POST', { ...input, householdId: 'B' })).status).toBe(401)
    expect((await request('/internal/auth/sessions', 'POST', { ...input, householdId: 'A' })).status).toBe(201)
    expect(await (await request(`/internal/auth/sessions/${input.token}`)).json()).toMatchObject({ data: { householdId: 'A' } })
    expect((await request(`/internal/auth/sessions/${input.token}`, 'DELETE')).status).toBe(200)
    expect(await (await request(`/internal/auth/sessions/${input.token}`)).json()).toEqual({ data: null })
    expect((await request('/sessions', 'POST', { ...input, householdId: 'A' })).status).toBe(404)
  })
  it('bodyの世帯指定を無視してDB sessionの世帯にパスキーを登録・管理する', async () => {
    const input = { id: 'key', householdId: 'B', person: 'wife', publicKeyBase64: 'AQID', counter: 0 }
    expect(await (await request('/passkeys', 'POST', input, tokenA)).json()).toMatchObject({ data: { householdId: 'A' } })
    expect(await (await request('/passkeys/key', 'GET', undefined, tokenB)).json()).toEqual({ data: null })
    expect(await (await request('/passkeys?person=wife', 'GET', undefined, tokenA)).json()).toMatchObject({ data: [{ id: 'key', householdId: 'A' }] })
    await request('/passkeys/key', 'DELETE', undefined, tokenB)
    expect(await (await request('/internal/auth/credentials/key')).json()).toMatchObject({ data: { householdId: 'A' } })
    await request('/internal/auth/credentials/key', 'PATCH', { householdId: 'A', counter: 2 })
    expect(await (await request('/passkeys/key', 'GET', undefined, tokenA)).json()).toMatchObject({ data: { counter: 2 } })
    await request('/passkeys/key', 'DELETE', undefined, tokenA)
    expect(await (await request('/internal/auth/credentials/key')).json()).toEqual({ data: null })
  })
  it('登録/認証前challengeは異なる契約で作成しIDと世帯が一致する試行だけ消費する', async () => {
    const a = await (await request('/webauthn-challenges', 'POST', { challenge: 'a', person: 'wife', householdId: 'B', expiresAt }, tokenA)).json() as { data: { id: string } }
    const path = `/webauthn-challenges/${a.data.id}/consume`
    expect(await (await request(path, 'POST', { person: 'wife' }, tokenB)).json()).toEqual({ data: null })
    expect(await (await request(path, 'POST', { person: 'wife' }, tokenA)).json()).toMatchObject({ data: { householdId: 'A', challenge: 'a' } })
    expect(await (await request(path, 'POST', { person: 'wife' }, tokenA)).json()).toEqual({ data: null })
    const b = await (await request('/internal/auth/challenges', 'POST', { challenge: 'b', person: null, householdId: 'A', expiresAt })).json() as { data: { id: string, householdId: unknown } }
    expect(b.data.householdId).toBeNull()
    const authPath = `/internal/auth/challenges/${b.data.id}/consume`
    expect(await (await request(authPath, 'POST', { person: null })).json()).toMatchObject({ data: { householdId: null, challenge: 'b' } })
    expect(await (await request(authPath, 'POST', { person: null })).json()).toEqual({ data: null })
  })
  it('期限切れchallengeを削除して有効な別試行を残す', async () => {
    for (const [challenge, expiry] of [['expired', now.toISOString()], ['active', expiresAt]]) {
      await request('/internal/auth/challenges', 'POST', { challenge, person: null, expiresAt: expiry })
    }
    expect((await request('/internal/auth/challenges/expired', 'DELETE', { before: now.toISOString() })).status).toBe(200)
    expect(state.sqlite.prepare('SELECT challenge FROM webauthn_challenges').all()).toEqual([{ challenge: 'active' }])
  })
  it.each([
    ['token', { token: 'invalid' }, 'tokenが不正です'], ['person', { person: 'partner' }, 'personが不正です'],
    ['authMethod', { authMethod: 'magic-link' }, 'authMethodが不正です'], ['expiresAt', { expiresAt: 'invalid-date' }, 'expiresAtが不正です'],
  ])('session %s不正時に400を返す', async (_name, override, error) => {
    const response = await request('/internal/auth/sessions', 'POST', { householdId: 'A', token: 'c'.repeat(64), person: 'wife', authMethod: 'passkey', expiresAt, ...override })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
  })
  it('認証前challengeへpersonを指定できず、不正期限を拒否する', async () => {
    expect((await request('/internal/auth/challenges', 'POST', { challenge: 'a', person: 'wife', expiresAt })).status).toBe(400)
    const response = await request('/internal/auth/challenges', 'POST', { challenge: 'a', person: null, expiresAt: 'bad' })
    expect(response.status).toBe(400)
  })
})
