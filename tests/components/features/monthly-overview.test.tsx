import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MonthlyOverview } from '@/features/monthly-overview'
import type { Expense, Income, MonthlySummary } from '@/types'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('@/features/copy-month', () => ({
  CopyMonthDialog: () => <button type="button">前月からコピー</button>,
}))

vi.mock('@/features/export-csv', () => ({
  ExportCsvButton: () => <button type="button">CSV出力</button>,
}))

const incomes: Income[] = [
  {
    id: 'income-1',
    month: '202604',
    label: '夫手取り',
    amount: 100000,
    person: 'husband',
  },
  {
    id: 'income-2',
    month: '202604',
    label: '妻手取り',
    amount: 500000,
    person: 'wife',
  },
]

const expenses: Expense[] = [
  {
    id: 'expense-1',
    month: '202604',
    label: '家賃',
    amount: -100000,
    person: 'husband',
    isCarryover: false,
  },
]

const summaries: MonthlySummary[] = [
  {
    month: '202603',
    incomeTotal: 580000,
    expenseTotal: -180000,
    balance: 400000,
  },
  {
    month: '202604',
    incomeTotal: 600000,
    expenseTotal: -100000,
    balance: 500000,
  },
]

function renderOverview() {
  return render(
    <MonthlyOverview
      year={2026}
      month={4}
      summary={{ incomes, expenses, carryovers: [] }}
      summaries={summaries}
    />
  )
}

describe('MonthlyOverview', () => {
  it('structured propsを受け取るMonthlyOverviewを公開する', () => {
    expect(MonthlyOverview).toBeTypeOf('function')
  })

  it('精算額と方向を最上位見出しとして表示する', () => {
    renderOverview()

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '精算額 ¥250,000 妻 → 夫',
      })
    ).toBeInTheDocument()
  })

  it('月次要約のラベルを日本語で表示する', () => {
    const { container } = renderOverview()

    expect(screen.getByText('精算額')).toBeInTheDocument()
    expect(screen.getByText('月収支')).toBeInTheDocument()
    expect(screen.getByText('お小遣い')).toBeInTheDocument()
    expect(screen.getByText('推移')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(
      /Score Splitter|Balance|Allowance|Settlement|Trend/
    )
  })

  it('精算方向に夫と妻の文字を残す', () => {
    renderOverview()

    expect(screen.getByText('妻 → 夫')).toBeInTheDocument()
  })

  it('月移動ボタンに44px以上のタッチ領域がある', () => {
    renderOverview()

    expect(screen.getByRole('button', { name: '前月に移動' })).toHaveClass(
      'h-11',
      'w-11'
    )
    expect(screen.getByRole('button', { name: '翌月に移動' })).toHaveClass(
      'h-11',
      'w-11'
    )
    expect(screen.getByRole('button', { name: '今月に移動' })).toHaveClass(
      'h-11'
    )
  })

  it('childrenなしで推移を内部構成し、要約順に表示する', () => {
    renderOverview()

    const overview = screen.getByRole('region', { name: '月次要約' })
    const settlement = within(overview).getByText('精算額')
    const balance = within(overview).getByText('月収支')
    const allowance = within(overview).getByText('お小遣い')
    const trend = within(overview).getByRole('img', {
      name: '直近2ヶ月の収入と支出の推移グラフ',
    })

    expect(settlement.compareDocumentPosition(balance)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(balance.compareDocumentPosition(allowance)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(allowance.compareDocumentPosition(trend)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })
})
