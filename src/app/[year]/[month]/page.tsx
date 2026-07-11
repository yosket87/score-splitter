import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { HeroSection } from '@/features/monthly-overview'
import { TrendCard } from '@/components/charts/trend-card'
import { IncomeSection } from '@/features/income'
import { ExpenseSection } from '@/features/expense'
import { CarryoverSection } from '@/features/carryover'
import { getIncomesByMonth } from '@/app/actions/income'
import { getExpensesByMonth } from '@/app/actions/expense'
import { getCarryoversByMonth } from '@/app/actions/carryover'
import { getMonthlySummaries } from '@/app/actions/monthly-summary'
import { AddEntryFab } from '@/features/add-entry'
import { isValidYear, isValidMonthParam, pathToMonth } from '@/lib/utils/format'
import { requireAuth } from '@/lib/webauthn/session'

interface MonthPageProps {
  params: Promise<{ year: string; month: string }>
}

export default async function MonthPage({ params }: MonthPageProps) {
  const { year, month: monthParam } = await params
  await requireAuth()

  if (!isValidYear(year) || !isValidMonthParam(monthParam)) {
    redirect('/')
  }

  const month = pathToMonth(year, monthParam)

  const [incomesResult, expensesResult, carryoversResult, summariesResult] = await Promise.all([
    getIncomesByMonth(month),
    getExpensesByMonth(month),
    getCarryoversByMonth(month),
    getMonthlySummaries(),
  ])

  if (!incomesResult.success || !expensesResult.success || !carryoversResult.success) {
    throw new Error(
      incomesResult.error ?? expensesResult.error ?? carryoversResult.error ?? 'データの取得に失敗しました'
    )
  }

  const incomes = incomesResult.data ?? []
  const expenses = expensesResult.data ?? []
  const carryovers = carryoversResult.data ?? []
  const allSummaries = summariesResult.success ? (summariesResult.data ?? []) : []
  const recentSummaries = allSummaries.slice(0, 6)

  return (
    <div className="min-h-screen bg-background">
      <Header tone="hero" />
      <HeroSection
        currentMonth={month}
        incomes={incomes}
        expenses={expenses}
        carryovers={carryovers}
      >
        <TrendCard summaries={recentSummaries} currentMonth={month} />
      </HeroSection>
      <main id="main" tabIndex={-1} className="px-5 pt-8 pb-10 space-y-10 max-w-4xl mx-auto">
        <IncomeSection incomes={incomes} month={month} />
        <ExpenseSection expenses={expenses} month={month} />
        <CarryoverSection carryovers={carryovers} month={month} />
      </main>
      <AddEntryFab month={month} />
    </div>
  )
}
