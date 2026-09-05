import '../../../../tests/mocks/next'
import { mockCookies } from '../../../../tests/mocks/next'
vi.mock('server-only', () => ({}))
const context = { householdId: 'A' }
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { D1DatabaseLike, Runtime } from '../../../../cloudflare/worker/src/d1'

const backend = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getRuntime: vi.fn(),
  isWorkerApiMockEnabled: vi.fn(),
  runD1Operation: vi.fn(),
}))
const sessions = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}))
const loginAttempts = vi.hoisted(() => ({
  checkLoginRateLimit: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
  resetLoginAttempts: vi.fn(),
}))
const passkeys = vi.hoisted(() => ({
  listPasskeys: vi.fn(),
  getPasskey: vi.fn(),
  findAuthenticationCredential: vi.fn(),
  createPasskey: vi.fn(),
  updatePasskeyCounter: vi.fn(),
  deletePasskey: vi.fn(),
}))
const challenges = vi.hoisted(() => ({
  createChallenge: vi.fn(),
  consumeChallenge: vi.fn(),
  deleteExpiredChallenges: vi.fn(),
}))
const client = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('@/lib/api/backend', () => backend)
vi.mock('../../../../cloudflare/worker/src/sessions', () => sessions)
vi.mock('../../../../cloudflare/worker/src/login-attempts', () => loginAttempts)
vi.mock('../../../../cloudflare/worker/src/passkeys', () => passkeys)
vi.mock('../../../../cloudflare/worker/src/challenges', () => challenges)
vi.mock('@/lib/api/client', () => client)

import {
  createSession,
  deleteSession,
  getSession,
} from '@/lib/api/sessions'
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
} from '@/lib/api/login-attempts'
import {
  createChallenge,
  createPasskey,
  deleteExpiredChallenges,
  deletePasskey,
  consumeChallenge,
  getPasskey,
  findAuthenticationCredential,
  listPasskeys,
  updatePasskeyCounter,
} from '@/lib/api/passkeys'

const fakeDb = {} as D1DatabaseLike
const fakeRuntime = {} as Runtime
const session = {
  token: 'a'.repeat(64),
  householdId: 'A',
  person: 'husband' as const,
  authMethod: 'password' as const,
  expiresAt: '2026-09-02T01:00:00.000Z',
}
const passkey = {
  id: 'credential-1',
  person: 'wife' as const,
  publicKeyBase64: 'public-key',
  counter: 0,
  deviceName: null,
  transports: [] as string[],
  createdAt: '2026-09-02T00:00:00.000Z',
}
const challenge = {
  id: 'challenge-1',
  challenge: 'challenge-value',
  type: 'registration' as const,
  person: 'wife' as const,
  expiresAt: '2026-09-02T00:05:00.000Z',
  createdAt: '2026-09-02T00:00:00.000Z',
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('認証APIのD1直接アクセス', () => {
  it('通常環境のセッション操作はHTTPを経由せずD1関数へ委譲する', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(false)
    backend.getDatabase.mockReturnValue(fakeDb)
    backend.getRuntime.mockReturnValue(fakeRuntime)
    backend.runD1Operation.mockImplementation((operation: () => Promise<unknown>) => operation())
    sessions.createSession.mockResolvedValue(session)
    sessions.getSession.mockResolvedValue(null)
    sessions.deleteSession.mockResolvedValue(undefined)

    await expect(createSession(context, session)).resolves.toEqual(session)
    await expect(getSession(session.token)).resolves.toBeNull()
    await expect(deleteSession(session.token)).resolves.toBeUndefined()

    expect(sessions.createSession).toHaveBeenCalledWith(fakeDb, fakeRuntime, context, session)
    expect(sessions.getSession).toHaveBeenCalledWith(fakeDb, session.token)
    expect(sessions.deleteSession).toHaveBeenCalledWith(fakeDb, session.token)
    expect(backend.runD1Operation).toHaveBeenCalledTimes(3)
    expect(client.apiRequest).not.toHaveBeenCalled()
  })

  it('通常環境のログイン試行制限はキーをWorker入力形式でD1関数へ渡す', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(false)
    backend.getDatabase.mockReturnValue(fakeDb)
    backend.getRuntime.mockReturnValue(fakeRuntime)
    backend.runD1Operation.mockImplementation((operation: () => Promise<unknown>) => operation())
    loginAttempts.checkLoginRateLimit.mockResolvedValue({ allowed: true })
    loginAttempts.recordFailedLoginAttempt.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
    })
    loginAttempts.resetLoginAttempts.mockResolvedValue(undefined)

    await expect(checkLoginRateLimit('login-key')).resolves.toEqual({ allowed: true })
    await expect(recordFailedLoginAttempt('login-key')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    })
    await expect(resetLoginAttempts('login-key')).resolves.toBeUndefined()

    expect(loginAttempts.checkLoginRateLimit).toHaveBeenCalledWith(fakeDb, fakeRuntime, {
      key: 'login-key',
    })
    expect(loginAttempts.recordFailedLoginAttempt).toHaveBeenCalledWith(fakeDb, fakeRuntime, {
      key: 'login-key',
    })
    expect(loginAttempts.resetLoginAttempts).toHaveBeenCalledWith(fakeDb, { key: 'login-key' })
    expect(backend.runD1Operation).toHaveBeenCalledTimes(3)
    expect(client.apiRequest).not.toHaveBeenCalled()
  })

  it('通常環境のパスキー操作はHTTPを経由せずD1関数へ委譲する', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(false)
    backend.getDatabase.mockReturnValue(fakeDb)
    backend.getRuntime.mockReturnValue(fakeRuntime)
    backend.runD1Operation.mockImplementation((operation: () => Promise<unknown>) => operation())
    passkeys.listPasskeys.mockResolvedValue([passkey])
    passkeys.getPasskey.mockResolvedValue(null)
    passkeys.createPasskey.mockResolvedValue(passkey)
    passkeys.updatePasskeyCounter.mockResolvedValue(undefined)
    passkeys.deletePasskey.mockResolvedValue(undefined)

    await expect(listPasskeys(context, 'wife')).resolves.toEqual([passkey])
    await expect(getPasskey(context, passkey.id)).resolves.toBeNull()
    await expect(
      createPasskey(context, {
        id: passkey.id,
        person: passkey.person,
        publicKeyBase64: passkey.publicKeyBase64,
        counter: passkey.counter,
        deviceName: passkey.deviceName,
        transports: passkey.transports,
      })
    ).resolves.toEqual(passkey)
    await expect(updatePasskeyCounter(context, passkey.id, 7)).resolves.toBeUndefined()
    await expect(deletePasskey(context, passkey.id)).resolves.toBeUndefined()

    expect(passkeys.listPasskeys).toHaveBeenCalledWith(fakeDb, context, 'wife')
    expect(passkeys.getPasskey).toHaveBeenCalledWith(fakeDb, context, passkey.id)
    expect(passkeys.createPasskey).toHaveBeenCalledWith(fakeDb, fakeRuntime, context, {
      id: passkey.id,
      person: passkey.person,
      publicKeyBase64: passkey.publicKeyBase64,
      counter: passkey.counter,
      deviceName: passkey.deviceName,
      transports: [],
    })
    expect(passkeys.updatePasskeyCounter).toHaveBeenCalledWith(fakeDb, context, passkey.id, { counter: 7 })
    expect(passkeys.deletePasskey).toHaveBeenCalledWith(fakeDb, context, passkey.id)
    expect(backend.runD1Operation).toHaveBeenCalledTimes(5)
    expect(client.apiRequest).not.toHaveBeenCalled()
  })

  it('登録と認証前challengeのscope/IDをD1へ明示的に渡す', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(false)
    backend.getDatabase.mockReturnValue(fakeDb)
    backend.getRuntime.mockReturnValue(fakeRuntime)
    backend.runD1Operation.mockImplementation((operation: () => Promise<unknown>) => operation())
    challenges.createChallenge.mockResolvedValue(challenge)
    challenges.consumeChallenge.mockResolvedValue(null)
    const scope = { type: 'registration' as const, context }
    const input = { challenge: challenge.challenge, person: challenge.person, expiresAt: challenge.expiresAt }
    expect(await createChallenge(scope, input)).toEqual(challenge)
    expect(await consumeChallenge(scope, 'id', 'wife')).toBeNull()
    await deleteExpiredChallenges('before')
    expect(challenges.createChallenge).toHaveBeenCalledWith(fakeDb, fakeRuntime, scope, input)
    expect(challenges.consumeChallenge).toHaveBeenCalledWith(fakeDb, fakeRuntime, scope, 'id', 'wife')
    expect(challenges.deleteExpiredChallenges).toHaveBeenCalledWith(fakeDb, 'before')
    expect(client.apiRequest).not.toHaveBeenCalled()
  })

  it('認証前credential検索を管理用取得から分けて委譲する', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(false)
    backend.getDatabase.mockReturnValue(fakeDb)
    backend.runD1Operation.mockImplementation((operation: () => Promise<unknown>) => operation())
    passkeys.findAuthenticationCredential.mockResolvedValue(passkey)
    expect(await findAuthenticationCredential(passkey.id)).toEqual(passkey)
    expect(passkeys.findAuthenticationCredential).toHaveBeenCalledWith(fakeDb, passkey.id)
    expect(passkeys.getPasskey).not.toHaveBeenCalled()
  })

  it('モックHTTPの管理経路だけにcookie sessionを渡し、内部control-planeと区別する', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(true)
    client.apiRequest.mockResolvedValue({ data: session })
    mockCookies.get.mockReturnValue({ value: session.token })
    await deleteSession(session.token)
    await resetLoginAttempts('login-key')
    await updatePasskeyCounter(context, passkey.id, 7)
    await deletePasskey(context, passkey.id)
    await deleteExpiredChallenges('before')
    expect(client.apiRequest).toHaveBeenCalledWith(`/internal/auth/sessions/${session.token}`, { method: 'DELETE' })
    expect(client.apiRequest).toHaveBeenCalledWith('/login-attempts/reset', { method: 'POST', body: { key: 'login-key' } })
    expect(client.apiRequest).toHaveBeenCalledWith(`/internal/auth/credentials/${passkey.id}`, { method: 'PATCH', body: { householdId: 'A', counter: 7 } })
    expect(client.apiRequest).toHaveBeenCalledWith(`/passkeys/${passkey.id}`, { method: 'DELETE', sessionToken: session.token })
    expect(client.apiRequest).toHaveBeenCalledWith('/internal/auth/challenges/expired', { method: 'DELETE', body: { before: 'before' } })
    expect(backend.getDatabase).not.toHaveBeenCalled()
  })
})
