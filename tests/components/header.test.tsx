import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Header } from '@/components/layout/header'
import { metadata } from '@/app/layout'

vi.mock('@/app/actions/auth', () => ({
  logout: vi.fn(),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

vi.mock('@/components/providers/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/app/globals.css', () => ({}))

describe('Header', () => {
  it('ブランドと日本語の共通操作を表示する', () => {
    render(<Header />)

    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'テーマを切り替え' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
  })

  it('操作ボタンに44px以上のタッチ領域とフォーカスリングがある', () => {
    render(<Header />)

    const controls = [
      screen.getByRole('button', { name: 'テーマを切り替え' }),
      screen.getByRole('link', { name: '設定' }),
      screen.getByRole('button', { name: 'ログアウト' }),
    ]

    for (const control of controls) {
      expect(control).toHaveClass('size-11', 'focus-visible:ring-[3px]')
    }
  })

  it('任意の戻る導線を44pxの操作として表示する', () => {
    render(<Header backHref="/2026" backLabel="月一覧へ戻る" />)

    expect(screen.getByRole('link', { name: '月一覧へ戻る' })).toHaveAttribute('href', '/2026')
    expect(screen.getByRole('link', { name: '月一覧へ戻る' })).toHaveClass('size-11')
  })

  it('インライン背景を使わないStickyガラスバーである', () => {
    const { container } = render(<Header />)
    const header = container.querySelector('header')

    expect(header).toHaveClass('app-sticky-glass')
    expect(header).not.toHaveAttribute('style')
  })

  it('本文と同じ最大幅でヘッダー内容を配置する', () => {
    const { container } = render(<Header />)
    const headerInner = container.querySelector('header > div')

    expect(headerInner).toHaveClass('max-w-6xl')
    expect(headerInner).not.toHaveClass('max-w-4xl')
  })
})

describe('アプリメタデータ', () => {
  it('ヤマワケをアプリ名として公開する', () => {
    expect(metadata.title).toBe('ヤマワケ')
    expect(metadata.applicationName).toBe('ヤマワケ')
  })
})
