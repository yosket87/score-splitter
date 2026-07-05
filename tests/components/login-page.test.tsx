import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'
import LoginPage from '@/app/login/page'
import { isAuthenticated } from '@/lib/webauthn/session'

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: vi.fn(),
  }),
}))

vi.mock('@/app/actions/auth', () => ({
  login: vi.fn(),
}))

vi.mock('@/lib/webauthn/session', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

vi.mock('@/features/passkey/components/passkey-login-button', () => ({
  PasskeyLoginButton: () => <button type="button">パスキーでログイン</button>,
}))

describe('LoginPage', () => {
  it('未認証の場合はログインフォームを表示する', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false)

    render(await LoginPage())

    expect(screen.getByRole('heading', { name: 'Score Splitter' })).toBeInTheDocument()
    expect(screen.queryByText('家計計算アプリ')).not.toBeInTheDocument()
    expect(screen.getByText('パスワードの表示状態: 非表示')).toBeInTheDocument()
    expect(screen.queryByText('Help ›')).not.toBeInTheDocument()
  })

  it('認証済みの場合はトップページへリダイレクトする', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true)

    await expect(LoginPage()).rejects.toThrow('NEXT_REDIRECT:/')

    expect(redirect).toHaveBeenCalledWith('/')
  })
})
