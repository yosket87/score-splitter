import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { MonthlyOverview } from '@/features/monthly-overview'
import { IncomeSection } from '@/features/income'
import { ExpenseSection } from '@/features/expense'
import { CarryoverSection } from '@/features/carryover'
import { getIncomesByMonth } from '@/app/actions/income'
import { getExpensesByMonth } from '@/app/actions/expense'
import { getCarryoversByMonth } from '@/app/actions/carryover'
import { getMonthlySummaries } from '@/app/actions/monthly-summary'
import { AddEntryFab } from '@/features/add-entry'
import { isAiDiagnosisAvailable } from '@/features/ai-diagnosis/provider'
import { isValidYear, isValidMonthParam, pathToMonth } from '@/lib/utils/format'
import { getPaymentStatus } from '@/app/actions/payment-status'
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

  const [incomesResult, expensesResult, carryoversResult, summariesResult, paymentStatus] = await Promise.all([
    getIncomesByMonth(month),
    getExpensesByMonth(month),
    getCarryoversByMonth(month),
    getMonthlySummaries(),
    getPaymentStatus(month),
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
  const aiDiagnosisAvailable = isAiDiagnosisAvailable()

  return (
    <div className="app-shell">
      <Header backHref={`/${year}`} backLabel="月の一覧へ戻る" />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto grid max-w-6xl gap-6 px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:px-5 md:pb-5 lg:grid-cols-[minmax(19rem,0.9fr)_minmax(0,1.4fr)] lg:items-start lg:gap-8 lg:py-8"
      >
        <aside className="min-w-0 lg:sticky lg:top-20">
          <MonthlyOverview
            paymentStatus={paymentStatus}
            year={Number(year)}
            month={Number(monthParam)}
            summary={{ incomes, expenses, carryovers }}
            summaries={recentSummaries}
            aiDiagnosisAvailable={aiDiagnosisAvailable}
          />
        </aside>
        <div className="min-w-0 space-y-4">
          <IncomeSection incomes={incomes} month={month} />
          <ExpenseSection expenses={expenses} month={month} />
          <CarryoverSection carryovers={carryovers} month={month} />
        </div>
      </main>
      <AddEntryFab month={month} />
    </div>
  )
}
