import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MonthPage from '@/app/[year]/[month]/page'
import YearPage from '@/app/[year]/page'
import { getIncomesByMonth } from '@/app/actions/income'
import { getExpensesByMonth } from '@/app/actions/expense'
import { getCarryoversByMonth } from '@/app/actions/carryover'
import { getMonthlySummaries } from '@/app/actions/monthly-summary'
import { requireAuth } from '@/lib/webauthn/session'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

vi.mock('@/lib/webauthn/session', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/app/actions/income', () => ({
  getIncomesByMonth: vi.fn(),
}))

vi.mock('@/app/actions/expense', () => ({
  getExpensesByMonth: vi.fn(),
}))

vi.mock('@/app/actions/carryover', () => ({
  getCarryoversByMonth: vi.fn(),
}))

vi.mock('@/app/actions/monthly-summary', () => ({
  getMonthlySummaries: vi.fn(),
}))

vi.mock('@/components/layout/header', () => ({
  Header: (props: { backHref?: string; backLabel?: string }) => (
    <header data-testid="header" data-back-href={props.backHref} data-back-label={props.backLabel} />
  ),
}))

vi.mock('@/features/monthly-overview', () => ({
  MonthlyOverview: (props: {
    year: number
    month: number
    summary: { incomes: unknown[]; expenses: unknown[]; carryovers: unknown[] }
    summaries: unknown[]
  }) => (
    <div
      data-testid="monthly-overview"
      data-year={props.year}
      data-month={props.month}
      data-incomes={props.summary.incomes.length}
      data-expenses={props.summary.expenses.length}
      data-carryovers={props.summary.carryovers.length}
      data-summaries={props.summaries.length}
    />
  ),
}))

vi.mock('@/features/income', () => ({
  IncomeSection: (props: { incomes: unknown[]; month: string }) => (
    <div data-testid="income-section" data-count={props.incomes.length} data-month={props.month} />
  ),
}))

vi.mock('@/features/expense', () => ({
  ExpenseSection: (props: { expenses: unknown[]; month: string }) => (
    <div data-testid="expense-section" data-count={props.expenses.length} data-month={props.month} />
  ),
}))

vi.mock('@/features/carryover', () => ({
  CarryoverSection: (props: { carryovers: unknown[]; month: string }) => (
    <div data-testid="carryover-section" data-count={props.carryovers.length} data-month={props.month} />
  ),
}))

vi.mock('@/features/add-entry', () => ({
  AddEntryFab: (props: { month: string }) => <div data-testid="add-entry" data-month={props.month} />,
}))

vi.mock('@/features/monthly-list', () => ({
  MonthlyListSection: (props: { summaries: unknown[]; year: number }) => (
    <div data-testid="monthly-list" data-count={props.summaries.length} data-year={props.year} />
  ),
}))

const success = <T,>(data?: T) => ({ success: true as const, data })
const failure = (error?: string) => ({ success: false as const, error })

describe('MonthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(undefined)
  })

  it('認証後に対象月のデータと直近6ヶ月を各セクションへ渡す', async () => {
    vi.mocked(getIncomesByMonth).mockResolvedValue(success([{ id: 'income-1' }]) as never)
    vi.mocked(getExpensesByMonth).mockResolvedValue(success([{ id: 'expense-1' }]) as never)
    vi.mocked(getCarryoversByMonth).mockResolvedValue(success([{ id: 'carryover-1' }]) as never)
    vi.mocked(getMonthlySummaries).mockResolvedValue(
      success(Array.from({ length: 8 }, (_, index) => ({ month: `2026-${index + 1}` }))) as never
    )

    const { container } = render(
      await MonthPage({ params: Promise.resolve({ year: '2026', month: '02' }) })
    )

    expect(requireAuth).toHaveBeenCalledOnce()
    expect(getIncomesByMonth).toHaveBeenCalledWith('202602')
    expect(getExpensesByMonth).toHaveBeenCalledWith('202602')
    expect(getCarryoversByMonth).toHaveBeenCalledWith('202602')
    expect(screen.getByTestId('header')).toHaveAttribute('data-back-href', '/2026')
    expect(screen.getByTestId('monthly-overview')).toHaveAttribute('data-summaries', '6')
    expect(screen.getByTestId('monthly-overview')).toHaveAttribute('data-incomes', '1')
    expect(screen.getByTestId('income-section')).toHaveAttribute('data-month', '202602')
    expect(screen.getByTestId('expense-section')).toHaveAttribute('data-count', '1')
    expect(screen.getByTestId('carryover-section')).toHaveAttribute('data-count', '1')
    expect(screen.getByTestId('add-entry')).toHaveAttribute('data-month', '202602')
    expect(container.querySelector('main#main')).toHaveAttribute('tabindex', '-1')
  })

  it('データ未設定とサマリー取得失敗を空配列として扱う', async () => {
    vi.mocked(getIncomesByMonth).mockResolvedValue(success() as never)
    vi.mocked(getExpensesByMonth).mockResolvedValue(success() as never)
    vi.mocked(getCarryoversByMonth).mockResolvedValue(success() as never)
    vi.mocked(getMonthlySummaries).mockResolvedValue(failure('サマリーエラー') as never)

    render(await MonthPage({ params: Promise.resolve({ year: '2026', month: '02' }) }))

    expect(screen.getByTestId('monthly-overview')).toHaveAttribute('data-summaries', '0')
    expect(screen.getByTestId('monthly-overview')).toHaveAttribute('data-incomes', '0')
    expect(screen.getByTestId('monthly-overview')).toHaveAttribute('data-expenses', '0')
    expect(screen.getByTestId('monthly-overview')).toHaveAttribute('data-carryovers', '0')
  })

  it.each([
    [failure('収入エラー'), success([]), success([]), '収入エラー'],
    [success([]), failure('支出エラー'), success([]), '支出エラー'],
    [success([]), success([]), failure('繰越エラー'), '繰越エラー'],
    [failure(), failure(), failure(), 'データの取得に失敗しました'],
  ])('取得失敗を優先順位に従って例外化する', async (incomes, expenses, carryovers, message) => {
    vi.mocked(getIncomesByMonth).mockResolvedValue(incomes as never)
    vi.mocked(getExpensesByMonth).mockResolvedValue(expenses as never)
    vi.mocked(getCarryoversByMonth).mockResolvedValue(carryovers as never)
    vi.mocked(getMonthlySummaries).mockResolvedValue(success([]) as never)

    await expect(
      MonthPage({ params: Promise.resolve({ year: '2026', month: '02' }) })
    ).rejects.toThrow(message)
  })

  it.each([
    [{ year: '20x6', month: '02' }],
    [{ year: '2026', month: '13' }],
  ])('不正な年月はトップへリダイレクトする', async (params) => {
    await expect(MonthPage({ params: Promise.resolve(params) })).rejects.toThrow(
      'NEXT_REDIRECT:/'
    )
    expect(redirect).toHaveBeenCalledWith('/')
  })
})

describe('YearPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue(undefined)
  })

  it('対象年と月別サマリーを一覧へ渡す', async () => {
    vi.mocked(getMonthlySummaries).mockResolvedValue(success([{ month: '2026-02' }]) as never)

    const { container } = render(await YearPage({ params: Promise.resolve({ year: '2026' }) }))

    expect(requireAuth).toHaveBeenCalledOnce()
    expect(screen.getByTestId('monthly-list')).toHaveAttribute('data-year', '2026')
    expect(screen.getByTestId('monthly-list')).toHaveAttribute('data-count', '1')
    expect(container.querySelector('main#main')).toHaveAttribute('tabindex', '-1')
  })

  it('サマリー未設定を空配列として扱う', async () => {
    vi.mocked(getMonthlySummaries).mockResolvedValue(success() as never)

    render(await YearPage({ params: Promise.resolve({ year: '2026' }) }))

    expect(screen.getByTestId('monthly-list')).toHaveAttribute('data-count', '0')
  })

  it.each([
    [failure('月別エラー'), '月別エラー'],
    [failure(), '月別サマリーの取得に失敗しました'],
  ])('サマリー取得失敗を例外化する', async (result, message) => {
    vi.mocked(getMonthlySummaries).mockResolvedValue(result as never)

    await expect(YearPage({ params: Promise.resolve({ year: '2026' }) })).rejects.toThrow(message)
  })

  it('不正な年はトップへリダイレクトする', async () => {
    await expect(YearPage({ params: Promise.resolve({ year: 'abcd' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/'
    )
    expect(redirect).toHaveBeenCalledWith('/')
  })
})
