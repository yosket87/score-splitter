import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MonthlyListSection } from '@/features/monthly-list'
import type { MonthlySummary } from '@/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

const summaries: MonthlySummary[] = [
  {
    month: '202601',
    incomeTotal: 600000,
    expenseTotal: -450000,
    balance: 150000,
  },
  {
    month: '202602',
    incomeTotal: 580000,
    expenseTotal: -610000,
    balance: -30000,
  },
]

describe('MonthlyListSection', () => {
  it('年間要約と12か月一覧をlg以上の2列として構成する', () => {
    render(<MonthlyListSection summaries={summaries} year={2026} />)

    const annualSummary = screen.getByRole('complementary', {
      name: '年間要約',
    })
    const monthList = screen.getByRole('region', { name: '12か月一覧' })

    expect(annualSummary.parentElement).toBe(monthList.parentElement)
    expect(annualSummary.parentElement).toHaveClass('grid')
    expect(annualSummary.parentElement?.className).toMatch(/lg:grid-cols-/)
    expect(within(monthList).getAllByText(/^(?:[1-9]|1[0-2])月$/)).toHaveLength(
      12
    )
  })

  it('一覧のラベルを日本語で表示する', () => {
    const { container } = render(
      <MonthlyListSection summaries={summaries} year={2026} />
    )

    expect(screen.getByText('月一覧')).toBeInTheDocument()
    expect(screen.getByText('年間収支')).toBeInTheDocument()
    expect(screen.getByText('月別')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(
      /Months|Year-to-Date|Income|Expense|By Month|Now|View/
    )
  })

  it('記録がない年は静的アイコン、短い説明、次操作を表示する', () => {
    render(<MonthlyListSection summaries={[]} year={2026} />)

    expect(
      screen.getByRole('img', { name: '2026年の記録なし' })
    ).toBeInTheDocument()
    expect(screen.getByText('2026年の記録はまだありません')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '今月の画面を開く' })
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '12か月一覧' })).toBeInTheDocument()
  })
})
