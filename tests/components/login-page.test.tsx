import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage from '@/app/login/page'

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: vi.fn(),
  }),
}))

vi.mock('@/app/actions/auth', () => ({
  login: vi.fn(),
}))

vi.mock('@/features/passkey/components/passkey-login-button', () => ({
  PasskeyLoginButton: () => <button type="button">パスキーでログイン</button>,
}))

describe('LoginPage', () => {
  it('アプリ名と補助文言をScore Splitterに統一する', () => {
    render(<LoginPage />)

    expect(screen.getByRole('heading', { name: 'Score Splitter' })).toBeInTheDocument()
    expect(screen.queryByText('家計計算アプリ')).not.toBeInTheDocument()
    expect(screen.getByText('パスワードの表示状態: 非表示')).toBeInTheDocument()
    expect(screen.queryByText('Help ›')).not.toBeInTheDocument()
  })
})
