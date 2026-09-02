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
  createPasskey: vi.fn(),
  updatePasskeyCounter: vi.fn(),
  deletePasskey: vi.fn(),
}))
const challenges = vi.hoisted(() => ({
  createChallenge: vi.fn(),
  getLatestChallenge: vi.fn(),
  deleteChallenges: vi.fn(),
  deleteExpiredChallenges: vi.fn(),
  parseChallengeType: vi.fn(),
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
  deleteChallenges,
  deleteExpiredChallenges,
  deletePasskey,
  getLatestChallenge,
  getPasskey,
  listPasskeys,
  updatePasskeyCounter,
} from '@/lib/api/passkeys'

const fakeDb = {} as D1DatabaseLike
const fakeRuntime = {} as Runtime
const session = {
  token: 'a'.repeat(64),
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

    await expect(createSession(session)).resolves.toEqual(session)
    await expect(getSession(session.token)).resolves.toBeNull()
    await expect(deleteSession(session.token)).resolves.toBeUndefined()

    expect(sessions.createSession).toHaveBeenCalledWith(fakeDb, fakeRuntime, session)
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

    await expect(listPasskeys('wife')).resolves.toEqual([passkey])
    await expect(getPasskey(passkey.id)).resolves.toBeNull()
    await expect(
      createPasskey({
        id: passkey.id,
        person: passkey.person,
        publicKeyBase64: passkey.publicKeyBase64,
        counter: passkey.counter,
        deviceName: passkey.deviceName,
        transports: passkey.transports,
      })
    ).resolves.toEqual(passkey)
    await expect(updatePasskeyCounter(passkey.id, 7)).resolves.toBeUndefined()
    await expect(deletePasskey(passkey.id)).resolves.toBeUndefined()

    expect(passkeys.listPasskeys).toHaveBeenCalledWith(fakeDb, 'wife')
    expect(passkeys.getPasskey).toHaveBeenCalledWith(fakeDb, passkey.id)
    expect(passkeys.createPasskey).toHaveBeenCalledWith(fakeDb, fakeRuntime, {
      id: passkey.id,
      person: passkey.person,
      publicKeyBase64: passkey.publicKeyBase64,
      counter: passkey.counter,
      deviceName: passkey.deviceName,
      transports: [],
    })
    expect(passkeys.updatePasskeyCounter).toHaveBeenCalledWith(fakeDb, passkey.id, { counter: 7 })
    expect(passkeys.deletePasskey).toHaveBeenCalledWith(fakeDb, passkey.id)
    expect(backend.runD1Operation).toHaveBeenCalledTimes(5)
    expect(client.apiRequest).not.toHaveBeenCalled()
  })

  it('通常環境のchallenge操作は型を解析してD1関数へ委譲する', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(false)
    backend.getDatabase.mockReturnValue(fakeDb)
    backend.getRuntime.mockReturnValue(fakeRuntime)
    backend.runD1Operation.mockImplementation((operation: () => Promise<unknown>) => operation())
    challenges.parseChallengeType.mockReturnValue('registration')
    challenges.createChallenge.mockResolvedValue(challenge)
    challenges.getLatestChallenge.mockResolvedValue(null)
    challenges.deleteChallenges.mockResolvedValue(undefined)
    challenges.deleteExpiredChallenges.mockResolvedValue(undefined)
    const getLatestInput = { type: 'registration' as const, person: null }
    const deleteInput = { type: 'registration' as const, person: 'wife' as const }

    await expect(
      createChallenge({
        challenge: challenge.challenge,
        type: challenge.type,
        person: challenge.person,
        expiresAt: challenge.expiresAt,
      })
    ).resolves.toEqual(challenge)
    await expect(getLatestChallenge(getLatestInput)).resolves.toBeNull()
    await expect(deleteChallenges(deleteInput)).resolves.toBeUndefined()
    await expect(deleteExpiredChallenges('2026-09-02T00:00:00.000Z')).resolves.toBeUndefined()

    expect(challenges.createChallenge).toHaveBeenCalledWith(fakeDb, fakeRuntime, {
      challenge: challenge.challenge,
      type: challenge.type,
      person: challenge.person,
      expiresAt: challenge.expiresAt,
    })
    expect(challenges.parseChallengeType).toHaveBeenNthCalledWith(1, 'registration')
    expect(challenges.getLatestChallenge).toHaveBeenCalledWith(fakeDb, 'registration', null)
    expect(challenges.parseChallengeType).toHaveBeenNthCalledWith(2, 'registration')
    expect(challenges.deleteChallenges).toHaveBeenCalledWith(fakeDb, 'registration', 'wife')
    expect(challenges.deleteExpiredChallenges).toHaveBeenCalledWith(
      fakeDb,
      '2026-09-02T00:00:00.000Z'
    )
    expect(backend.runD1Operation).toHaveBeenCalledTimes(4)
    expect(client.apiRequest).not.toHaveBeenCalled()
  })

  it('モック環境のvoid操作はHTTPだけを呼びD1操作を呼ばない', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(true)
    client.apiRequest.mockResolvedValue(undefined)

    await expect(deleteSession(session.token)).resolves.toBeUndefined()
    await expect(resetLoginAttempts('login-key')).resolves.toBeUndefined()
    await expect(updatePasskeyCounter(passkey.id, 7)).resolves.toBeUndefined()
    await expect(deletePasskey(passkey.id)).resolves.toBeUndefined()
    await expect(
      deleteChallenges({ type: 'authentication', person: null })
    ).resolves.toBeUndefined()
    await expect(deleteExpiredChallenges('2026-09-02T00:00:00.000Z')).resolves.toBeUndefined()

    expect(client.apiRequest).toHaveBeenNthCalledWith(1, `/sessions/${session.token}`, {
      method: 'DELETE',
    })
    expect(client.apiRequest).toHaveBeenNthCalledWith(2, '/login-attempts/reset', {
      method: 'POST',
      body: { key: 'login-key' },
    })
    expect(client.apiRequest).toHaveBeenNthCalledWith(3, `/passkeys/${passkey.id}`, {
      method: 'PATCH',
      body: { counter: 7 },
    })
    expect(client.apiRequest).toHaveBeenNthCalledWith(4, `/passkeys/${passkey.id}`, {
      method: 'DELETE',
    })
    expect(client.apiRequest).toHaveBeenNthCalledWith(5, '/webauthn-challenges?type=authentication', {
      method: 'DELETE',
    })
    expect(client.apiRequest).toHaveBeenNthCalledWith(
      6,
      '/webauthn-challenges/expired?before=2026-09-02T00%3A00%3A00.000Z',
      { method: 'DELETE' }
    )
    expect(backend.getDatabase).not.toHaveBeenCalled()
    expect(backend.getRuntime).not.toHaveBeenCalled()
    expect(backend.runD1Operation).not.toHaveBeenCalled()
    expect(sessions.deleteSession).not.toHaveBeenCalled()
    expect(loginAttempts.resetLoginAttempts).not.toHaveBeenCalled()
    expect(passkeys.updatePasskeyCounter).not.toHaveBeenCalled()
    expect(passkeys.deletePasskey).not.toHaveBeenCalled()
    expect(challenges.deleteChallenges).not.toHaveBeenCalled()
    expect(challenges.deleteExpiredChallenges).not.toHaveBeenCalled()
  })
})
