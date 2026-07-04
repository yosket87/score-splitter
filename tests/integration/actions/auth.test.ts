import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import { mockHeaders, mockRedirect } from '../../../tests/mocks/next'
import { createFormData } from '../../../tests/mocks/helpers'

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}))

vi.mock('@/lib/webauthn/session', () => ({
  createSession: vi.fn(async () => 'mock-session-token'),
  deleteSession: vi.fn(async () => undefined),
  isAuthenticated: vi.fn(async () => false),
}))

const loginAttemptMocks = vi.hoisted(() => ({
  checkLoginRateLimit: vi.fn(async () => ({ allowed: true })),
  recordFailedLoginAttempt: vi.fn(async () => ({ allowed: true })),
  resetLoginAttempts: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api/login-attempts', () => loginAttemptMocks)

import bcrypt from 'bcryptjs'
import { isAuthenticated, login, logout } from '@/app/actions/auth'
import {
  createSession,
  deleteSession,
  isAuthenticated as checkSession,
} from '@/lib/webauthn/session'

describe('auth actions', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    vi.clearAllMocks()
    delete process.env.APP_PASSWORD_HASH_BASE64
    mockHeaders.get.mockImplementation((name: string) => {
      const normalized = name.toLowerCase()
      if (normalized === 'x-forwarded-for') return '203.0.113.10'
      if (normalized === 'user-agent') return 'vitest'
      return null
    })
    loginAttemptMocks.checkLoginRateLimit.mockResolvedValue({ allowed: true })
    loginAttemptMocks.recordFailedLoginAttempt.mockResolvedValue({ allowed: true })
    loginAttemptMocks.resetLoginAttempts.mockResolvedValue(undefined)
  })

  describe('login', () => {
    it('パスワード未入力でエラーを返す', async () => {
      const result = await login({ error: undefined }, createFormData({ password: '' }))

      expect(result.error).toBe('パスワードを入力してください')
    })

    it('環境変数からハッシュを取得して認証成功', async () => {
      const mockHash = '$2a$10$testHashValue'
      process.env.APP_PASSWORD_HASH_BASE64 = Buffer.from(mockHash).toString('base64')
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never)

      await expect(
        login({ error: undefined }, createFormData({ password: 'correct-password' }))
      ).rejects.toThrow('NEXT_REDIRECT:/')

      expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', mockHash)
      expect(loginAttemptMocks.resetLoginAttempts).toHaveBeenCalledWith(expect.any(String))
      expect(createSession).toHaveBeenCalledWith(null, 'password')
    })

    it('環境変数からハッシュを取得して認証失敗', async () => {
      const mockHash = '$2a$10$testHashValue'
      process.env.APP_PASSWORD_HASH_BASE64 = Buffer.from(mockHash).toString('base64')
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never)

      const result = await login(
        { error: undefined },
        createFormData({ password: 'wrong-password' })
      )

      expect(result.error).toBe('パスワードが正しくありません')
      expect(loginAttemptMocks.recordFailedLoginAttempt).toHaveBeenCalledWith(
        expect.any(String)
      )
      expect(createSession).not.toHaveBeenCalled()
    })

    it('試行上限時はbcrypt.compareに到達せずロック文言を返す', async () => {
      const mockHash = '$2a$10$testHashValue'
      process.env.APP_PASSWORD_HASH_BASE64 = Buffer.from(mockHash).toString('base64')
      loginAttemptMocks.checkLoginRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfterSeconds: 900,
      })

      const result = await login(
        { error: undefined },
        createFormData({ password: 'correct-password' })
      )

      expect(result.error).toBe(
        '試行回数が上限に達しました。しばらくしてからお試しください'
      )
      expect(bcrypt.compare).not.toHaveBeenCalled()
      expect(loginAttemptMocks.recordFailedLoginAttempt).not.toHaveBeenCalled()
      expect(createSession).not.toHaveBeenCalled()
    })

    it('環境変数がない場合は認証設定エラーを返す', async () => {
      const result = await login(
        { error: undefined },
        createFormData({ password: 'any-password' })
      )

      expect(result.error).toBe('認証設定が見つかりません')
      expect(bcrypt.compare).not.toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('セッションを削除してログインページにリダイレクト', async () => {
      await expect(logout()).rejects.toThrow('NEXT_REDIRECT:/login')

      expect(deleteSession).toHaveBeenCalled()
    })
  })

  describe('isAuthenticated', () => {
    it('セッションモジュールに委譲する', async () => {
      vi.mocked(checkSession).mockResolvedValueOnce(true)

      const result = await isAuthenticated()

      expect(result).toBe(true)
      expect(checkSession).toHaveBeenCalled()
    })
  })
})
