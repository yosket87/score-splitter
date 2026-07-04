import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { YearlyBarChart } from '@/components/charts/yearly-bar-chart'
import { TrendCard } from '@/components/charts/trend-card'
import { AddEntryFab } from '@/features/add-entry'
import type { MonthlySummary } from '@/types'

vi.mock('@/app/actions/income', () => ({
  createIncome: vi.fn(),
}))

vi.mock('@/app/actions/expense', () => ({
  createExpense: vi.fn(),
}))

vi.mock('@/app/actions/carryover', () => ({
  createCarryover: vi.fn(),
}))

describe('UX polish', () => {
  it('Dialogの閉じるボタンが日本語のアクセシブルネームを持つ', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>設定</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
  })

  it('FABがsafe-area下部を加味する', () => {
    render(<AddEntryFab month="202604" />)

    expect(screen.getByRole('button', { name: '項目を追加' })).toHaveClass(
      'bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]'
    )
  })

  it('年次棒グラフに説明ラベルと凡例テキストがある', () => {
    const summaries: MonthlySummary[] = [
      { month: '202601', incomeTotal: 100000, expenseTotal: -80000, balance: 20000 },
      { month: '202602', incomeTotal: 100000, expenseTotal: -120000, balance: -20000 },
    ]

    render(<YearlyBarChart summaries={summaries} year={2026} />)

    expect(
      screen.getByRole('img', { name: '2026年の月次収支推移グラフ' })
    ).toBeInTheDocument()
    expect(screen.getByText('プラス')).toBeInTheDocument()
    expect(screen.getByText('マイナス')).toBeInTheDocument()
  })

  it('トレンドカードに説明ラベルがある', () => {
    const summaries: MonthlySummary[] = [
      { month: '202601', incomeTotal: 100000, expenseTotal: -80000, balance: 20000 },
      { month: '202602', incomeTotal: 120000, expenseTotal: -90000, balance: 30000 },
    ]

    render(<TrendCard summaries={summaries} currentMonth="202602" />)

    expect(
      screen.getByRole('img', { name: '直近2ヶ月の収入と支出の推移グラフ' })
    ).toBeInTheDocument()
  })
})
