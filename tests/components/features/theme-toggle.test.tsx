import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const mockSetTheme = vi.fn()

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
  }),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockClear()
  })

  it('トグルボタンをレンダリングする', () => {
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'テーマを切り替え' })).toBeInTheDocument()
  })

  it('クリックでドロップダウンメニューが開く', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'テーマを切り替え' }))

    expect(screen.getByText('ライト')).toBeInTheDocument()
    expect(screen.getByText('ダーク')).toBeInTheDocument()
    expect(screen.getByText('システムに合わせる')).toBeInTheDocument()
  })

  it('「ライト」を選択するとsetTheme("light")が呼ばれる', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'テーマを切り替え' }))
    await user.click(screen.getByText('ライト'))

    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('「ダーク」を選択するとsetTheme("dark")が呼ばれる', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'テーマを切り替え' }))
    await user.click(screen.getByText('ダーク'))

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('「システムに合わせる」を選択するとsetTheme("system")が呼ばれる', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'テーマを切り替え' }))
    await user.click(screen.getByText('システムに合わせる'))

    expect(mockSetTheme).toHaveBeenCalledWith('system')
  })
})
