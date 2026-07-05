import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { MonthlyListSection } from '@/features/monthly-list'
import { getMonthlySummaries } from '@/app/actions/monthly-summary'
import { isValidYear } from '@/lib/utils/format'
import { requireAuth } from '@/lib/webauthn/session'

interface YearPageProps {
  params: Promise<{ year: string }>
}

export default async function YearPage({ params }: YearPageProps) {
  const { year } = await params
  await requireAuth()

  if (!isValidYear(year)) {
    redirect('/')
  }

  const summariesResult = await getMonthlySummaries()
  if (!summariesResult.success) {
    throw new Error(summariesResult.error ?? '月別サマリーの取得に失敗しました')
  }
  const summaries = summariesResult.data ?? []

  return (
    <div className="min-h-screen gradient-page">
      <Header />
      <main
        id="main"
        tabIndex={-1}
        className="px-5 py-5 space-y-6 max-w-4xl mx-auto"
      >
        <MonthlyListSection summaries={summaries} year={Number(year)} />
      </main>
    </div>
  )
}
