import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorPage from '@/app/error'

describe('ErrorPage', () => {
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
})
