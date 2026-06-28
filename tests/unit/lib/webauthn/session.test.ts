import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../../tests/mocks/next'
import {
  clearApiMocks,
  mockSessionsApi,
} from '../../../../tests/mocks/api'
import { mockCookies } from '../../../../tests/mocks/next'
import {
  createSession,
  deleteSession,
  getSession,
  getSessionPerson,
  isAuthenticated,
} from '@/lib/webauthn/session'

describe('session module', () => {
  beforeEach(() => {
    clearApiMocks()
    mockCookies.get.mockClear()
    mockCookies.set.mockClear()
    mockCookies.delete.mockClear()
    vi.clearAllMocks()
  })

  describe('createSession', () => {
    it('セッションをAPIで作成してcookieを設定する', async () => {
      mockSessionsApi.createSession.mockResolvedValueOnce({
        token: 'a'.repeat(64),
        person: 'husband',
        authMethod: 'passkey',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      const token = await createSession('husband', 'passkey')

      expect(token).toHaveLength(64)
      expect(mockSessionsApi.createSession).toHaveBeenCalledWith(
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

      await expect(createSession('wife', 'passkey')).rejects.toThrow(
        'セッション作成に失敗しました'
      )
    })
  })

  describe('getSession', () => {
    it('有効なセッションを返す', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'valid-token' })
      mockSessionsApi.getSession.mockResolvedValueOnce({
        token: 'valid-token',
        person: 'husband',
        authMethod: 'passkey',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      const session = await getSession()

      expect(mockSessionsApi.getSession).toHaveBeenCalledWith('valid-token')
      expect(session).toEqual({
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

    it('期限切れセッションの場合nullを返しセッションを削除する', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'expired-token' })
      mockSessionsApi.getSession.mockResolvedValueOnce({
        token: 'expired-token',
        person: 'wife',
        authMethod: 'password',
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      })
      mockCookies.get.mockReturnValueOnce({ value: 'expired-token' })

      const session = await getSession()

      expect(session).toBeNull()
      expect(mockSessionsApi.deleteSession).toHaveBeenCalledWith('expired-token')
      expect(mockCookies.delete).toHaveBeenCalledWith('household_session')
    })
  })

  describe('getSessionPerson', () => {
    it('セッションからpersonを返す', async () => {
      mockCookies.get.mockReturnValueOnce({ value: 'token' })
      mockSessionsApi.getSession.mockResolvedValueOnce({
        token: 'token',
        person: 'wife',
        authMethod: 'passkey',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      const person = await getSessionPerson()

      expect(person).toBe('wife')
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
