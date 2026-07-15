import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorPage from '@/app/error'
import Loading from '@/app/loading'
import NotFound from '@/app/not-found'
import SettingsPage from '@/app/settings/page'
import { requireAuth } from '@/lib/webauthn/session'

vi.mock('@/app/actions/auth', () => ({
  logout: vi.fn(),
}))

vi.mock('@/features/passkey', () => ({
  PasskeySettings: () => <div>パスキー設定内容</div>,
}))

vi.mock('@/lib/webauthn/session', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

describe('ErrorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('内部エラーメッセージを画面に表示しない', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorPage
        error={Object.assign(new Error('database password leaked'), {
          digest: 'digest-123',
        })}
        reset={vi.fn()}
      />
    )

    expect(screen.getByText('エラーが発生しました')).toBeInTheDocument()
    expect(
      screen.getByText('データの読み込みに失敗しました。再度お試しください。')
    ).toBeInTheDocument()
    expect(screen.getByText('問い合わせコード: digest-123')).toBeInTheDocument()
    expect(screen.queryByText(/database password leaked/)).not.toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('エラー画面をブランド背景とソリッドサーフェスで表示する', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <ErrorPage error={new Error('test')} reset={vi.fn()} />
    )

    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('app-shell')
    expect(container.querySelector('.app-solid-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試行' })).toHaveClass('min-h-11')

    consoleError.mockRestore()
  })

  it('404画面をブランド背景とソリッドサーフェスで表示する', () => {
    const { container } = render(<NotFound />)

    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('app-shell')
    expect(container.querySelector('.app-solid-panel')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ホームに戻る' })).toHaveClass('min-h-11')
  })

  it('読み込み画面をブランド背景・ロゴ・共通サーフェスで表示する', () => {
    const { container } = render(<Loading />)

    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toBeInTheDocument()
    expect(screen.getByText('読み込み中…')).toHaveAttribute('aria-live', 'polite')
    expect(container.firstElementChild).toHaveClass('app-shell')
    expect(container.querySelector('.app-glass-heavy')).toBeInTheDocument()
    expect(container.querySelector('.app-solid-panel')).toBeInTheDocument()
  })

  it('設定画面を共通ヘッダーと本文幅のソリッドサーフェスで表示する', async () => {
    vi.mocked(requireAuth).mockResolvedValue(undefined)

    const { container } = render(await SettingsPage())

    expect(requireAuth).toHaveBeenCalledOnce()
    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'トップへ戻る' })).toHaveClass('size-11')
    expect(screen.getByRole('heading', { name: 'パスキー管理' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('app-shell')
    expect(container.querySelector('main')).toHaveClass('max-w-6xl')
    expect(container.querySelector('.app-solid-panel')).toBeInTheDocument()
  })
})
