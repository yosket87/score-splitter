import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import { mockRedirect } from '../../../tests/mocks/next'
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
