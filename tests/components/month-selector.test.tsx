import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MonthSelector } from '@/components/layout/month-selector'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    span: ({
      children,
      custom,
      variants,
    }: {
      children: React.ReactNode
      custom: number
      variants: {
        enter: (direction: number) => unknown
        exit: (direction: number) => unknown
      }
    }) => {
      variants.enter(custom)
      variants.exit(custom)
      return <span>{children}</span>
    },
  },
}))

vi.mock('@/features/copy-month', () => ({
  CopyMonthDialog: ({ currentMonth, previousMonth }: { currentMonth: string; previousMonth: string }) => (
    <span data-testid="copy-month">{currentMonth}:{previousMonth}</span>
  ),
}))

vi.mock('@/features/export-csv', () => ({
  ExportCsvButton: () => <span data-testid="export-csv">CSV</span>,
}))

afterEach(() => {
  push.mockClear()
  vi.useRealTimers()
})

describe('MonthSelector', () => {
  it('前月・翌月・今月へ移動し、年一覧とコピー元を表示する', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 15))
    render(<MonthSelector currentMonth="202601" />)

    expect(screen.getByRole('link', { name: '月の一覧へ戻る' })).toHaveAttribute('href', '/2026')
    expect(screen.getByTestId('copy-month')).toHaveTextContent('202601:202512')

    fireEvent.click(screen.getByRole('button', { name: '前月に移動' }))
    fireEvent.click(screen.getByRole('button', { name: '翌月に移動' }))
    fireEvent.click(screen.getByRole('button', { name: '今月に移動' }))

    expect(push).toHaveBeenNthCalledWith(1, '/2025/12')
    expect(push).toHaveBeenNthCalledWith(2, '/2026/02')
    expect(push).toHaveBeenNthCalledWith(3, '/2026/07')
    expect(screen.queryByTestId('export-csv')).not.toBeInTheDocument()
  })

  it('月の前後方向を更新し、3種類のデータが揃った時だけCSV操作を表示する', () => {
    const { rerender } = render(<MonthSelector currentMonth="202601" incomes={[]} />)

    rerender(<MonthSelector currentMonth="202602" incomes={[]} expenses={[]} />)
    expect(screen.getByRole('button', { name: '今月に移動' })).toHaveTextContent('2026年2月')
    expect(screen.queryByTestId('export-csv')).not.toBeInTheDocument()

    rerender(
      <MonthSelector currentMonth="202512" incomes={[]} expenses={[]} carryovers={[]} />
    )
    expect(screen.getByRole('button', { name: '今月に移動' })).toHaveTextContent('2025年12月')
    expect(screen.getByTestId('export-csv')).toBeInTheDocument()
  })
})
