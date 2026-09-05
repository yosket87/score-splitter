import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../../tests/mocks/next'
vi.mock('server-only', () => ({}))
const context = { householdId: 'A' }
import {
  clearApiMocks,
  mockSessionsApi,
} from '../../../../tests/mocks/api'
import { mockCookies } from '../../../../tests/mocks/next'
import {
  createSession,
  deleteSession,
  getSession,
  isAuthenticated,
} from '@/lib/webauthn/session'

describe('session module', () => {
  beforeEach(() => {
    clearApiMocks()
    mockCookies.get.mockReset()
    mockCookies.set.mockClear()
    mockCookies.delete.mockClear()
    vi.clearAllMocks()
  })

  describe('createSession', () => {
    it('セッションをAPIで作成してcookieを設定する', async () => {
      mockSessionsApi.createSession.mockResolvedValueOnce({
        householdId: 'A',
        token: 'a'.repeat(64),
        person: 'husband',
        authMethod: 'passkey',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      const token = await createSession(context, 'husband', 'passkey')

      expect(token).toHaveLength(64)
      expect(mockSessionsApi.createSession).toHaveBeenCalledWith(
        context,
        expect.objectContaining({
          token,
          person: 'husband',
          authMethod: 'passkey',
        })
      )
      expect(mockCookies.set).toHaveBeenCalledWith(
        'household_session',
        token,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        })
      )
    })

    it('API作成失敗時にエラーをスローする', async () => {
      mockSessionsApi.createSession.mockRejectedValueOnce(new Error('API error'))

      await expect(createSession(context, 'wife', 'passkey')).rejects.toThrow(
        'セッション作成に失敗しました'
      )
    })
  })

  describe('getSession', () => {
    it('有効なセッションを返す', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'valid-token' })
      mockSessionsApi.getSession.mockResolvedValueOnce({
        householdId: 'A',
        token: 'valid-token',
        person: 'husband',
        authMethod: 'passkey',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      const session = await getSession()

      expect(mockSessionsApi.getSession).toHaveBeenCalledWith('valid-token')
      expect(session).toEqual({
        householdId: 'A',
        person: 'husband',
        authMethod: 'passkey',
      })
    })

    it('cookieがない場合nullを返す', async () => {
      mockCookies.get.mockReturnValueOnce(undefined)

      const session = await getSession()

      expect(session).toBeNull()
      expect(mockSessionsApi.getSession).not.toHaveBeenCalled()
    })

    it('期限切れセッションの場合読み取りだけでnullを返す', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'expired-token' })
      mockSessionsApi.getSession.mockResolvedValueOnce({
        householdId: 'A',
        token: 'expired-token',
        person: 'wife',
        authMethod: 'password',
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      })
      mockCookies.get.mockReturnValueOnce({ value: 'expired-token' })

      const session = await getSession()

      expect(session).toBeNull()
      expect(mockSessionsApi.deleteSession).not.toHaveBeenCalled()
      expect(mockCookies.delete).not.toHaveBeenCalled()
    })
  })

  describe('deleteSession', () => {
    it('APIからセッションを削除しcookieを削除する', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'session-token' })

      await deleteSession()

      expect(mockSessionsApi.deleteSession).toHaveBeenCalledWith('session-token')
      expect(mockCookies.delete).toHaveBeenCalledWith('household_session')
    })

    it('cookieがない場合もcookie削除は実行する', async () => {
      mockCookies.get.mockReturnValueOnce(undefined)

      await deleteSession()

      expect(mockSessionsApi.deleteSession).not.toHaveBeenCalled()
      expect(mockCookies.delete).toHaveBeenCalledWith('household_session')
    })
  })

  describe('isAuthenticated', () => {
    it('有効なセッションがあればtrueを返す', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'valid-token' })
      mockSessionsApi.getSession.mockResolvedValueOnce({
        householdId: 'A',
        token: 'valid-token',
        person: null,
        authMethod: 'password',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      const result = await isAuthenticated()

      expect(result).toBe(true)
    })

    it('期限切れセッションはfalseを返す', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'token' })
      mockSessionsApi.getSession.mockResolvedValueOnce({
        householdId: 'A',
        token: 'token',
        person: null,
        authMethod: 'password',
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      })

      const result = await isAuthenticated()

      expect(result).toBe(false)
    })
  })
})

describe('セッション境界の世帯認可', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T00:00:00.000Z'))
    mockCookies.get.mockReset().mockReturnValue({ value: 'a'.repeat(64) })
    mockSessionsApi.getSession.mockReset()
  })
  afterEach(() => vi.useRealTimers())
  it.each([
    { householdId: null }, { householdId: '' }, { authMethod: 'magic-link' },
    { expiresAt: 'bad-date' }, { expiresAt: '2026-09-05T00:00:00.000Z' },
  ])('不正所属・方式・期限を拒否する: %j', async (override) => {
    mockSessionsApi.getSession.mockResolvedValue({ token: 'a'.repeat(64), householdId: 'A', person: null, authMethod: 'password', expiresAt: '2026-09-05T01:00:00.000Z', ...override })
    expect(await getSession()).toBeNull()
    expect(await isAuthenticated()).toBe(false)
  })
  it('requireAuthはsessionを返しrequireHouseholdContextは不変の所属だけを返す', async () => {
    mockSessionsApi.getSession.mockResolvedValue({ token: 'a'.repeat(64), householdId: 'B', person: 'wife', authMethod: 'passkey', expiresAt: '2026-09-05T01:00:00.000Z' })
    const { requireAuth } = await import('@/lib/webauthn/session')
    const { requireHouseholdContext } = await import('@/lib/household-context')
    expect(await requireAuth()).toEqual({ householdId: 'B', person: 'wife', authMethod: 'passkey' })
    const context = await requireHouseholdContext()
    expect(context).toEqual({ householdId: 'B' })
    expect(Object.isFrozen(context)).toBe(true)
  })
  it('requireAuthは所属のないsessionをログインへ戻す', async () => {
    mockSessionsApi.getSession.mockResolvedValue(null)
    const { requireAuth } = await import('@/lib/webauthn/session')
    await expect(requireAuth()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
