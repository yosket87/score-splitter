'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { MonthRow } from './components/month-row'
import { YearlyBarChart } from '@/components/charts/yearly-bar-chart'
import { formatCurrency, monthToPath, parseMonth } from '@/lib/utils/format'
import type { MonthlySummary } from '@/types'

interface MonthlyListSectionProps {
  summaries: MonthlySummary[]
  year: number
}

export function MonthlyListSection({
  summaries,
  year,
}: MonthlyListSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const currentMonth = parseMonth(new Date())

  const availableYears = Array.from(
    new Set([
      ...summaries.map((summary) => Number(summary.month.slice(0, 4))),
      year,
    ])
  ).sort((a, b) => a - b)

  const yearSummaries = summaries.filter((summary) =>
    summary.month.startsWith(String(year))
  )
  const recordedCount = yearSummaries.length
  const balanceYTD = yearSummaries.reduce(
    (sum, summary) => sum + summary.balance,
    0
  )
  const incomeYTD = yearSummaries.reduce(
    (sum, summary) => sum + summary.incomeTotal,
    0
  )
  const expenseYTD = yearSummaries.reduce(
    (sum, summary) => sum + Math.abs(summary.expenseTotal),
    0
  )

  const allMonths = Array.from({ length: 12 }, (_, index) => {
    const value = `${year}${String(index + 1).padStart(2, '0')}`
    return {
      month: value,
      index: index + 1,
      summary:
        yearSummaries.find((summary) => summary.month === value) ?? null,
    }
  })

  const maxBalance = Math.max(
    ...yearSummaries.map((summary) => Math.abs(summary.balance)),
    1
  )
  const isBalancePositive = balanceYTD >= 0

  return (
    <section aria-label="月の一覧">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">
            月一覧
          </p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-4xl font-bold leading-none">{year}年</h1>
            <div className="relative">
              <select
                value={year}
                onChange={(event) =>
                  startTransition(() => router.push(`/${event.target.value}`))
                }
                disabled={isPending}
                className={`h-11 cursor-pointer appearance-none rounded-xl border border-border bg-card py-2 pl-3 pr-9 text-sm font-medium transition-opacity focus-visible:outline-none ${isPending ? 'opacity-50' : ''}`}
                aria-label="年を選択"
              >
                {availableYears.map((availableYear) => (
                  <option key={availableYear} value={availableYear}>
                    {availableYear}年
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {recordedCount > 0
            ? `${recordedCount}ヶ月分の記録があります`
            : '記録なし'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.3fr)] lg:items-start lg:gap-8">
        <aside aria-label="年間要約" className="space-y-3">
          {recordedCount > 0 ? (
            <div className="app-glass-heavy rounded-[24px] p-5">
              <p className="text-xs font-semibold text-muted-foreground">
                年間収支
              </p>
              <p
                className={`mt-1 font-mono text-3xl font-bold font-tabular ${
                  isBalancePositive ? 'text-accent' : 'text-destructive'
                }`}
              >
                {formatCurrency(balanceYTD, { signed: true })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>収入 {formatCurrency(incomeYTD)}</span>
                <span>支出 {formatCurrency(expenseYTD)}</span>
              </div>

              <div className="mt-5">
                <YearlyBarChart summaries={yearSummaries} year={year} />
              </div>
            </div>
          ) : (
            <div className="app-glass-heavy flex flex-col items-center rounded-[24px] px-5 py-10 text-center">
              <div
                role="img"
                aria-label={`${year}年の記録なし`}
                className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
              >
                <CalendarDays aria-hidden="true" className="size-6" />
              </div>
              <p className="mt-4 font-semibold">
                {year}年の記録はまだありません
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                収入や支出を記録すると、年間の推移を確認できます。
              </p>
              <Link
                href={monthToPath(currentMonth)}
                className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none"
              >
                今月の画面を開く
              </Link>
            </div>
          )}

          <p className="px-1 text-xs text-muted-foreground">
            ※各月の収支は繰越に回す前の金額です
          </p>
        </aside>

        <section
          aria-label="12か月一覧"
          className="app-solid-panel overflow-hidden rounded-[24px] px-4 sm:px-5"
        >
          <div className="flex items-baseline justify-between border-b border-border py-4">
            <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">
              月別
            </h2>
            <span className="text-xs text-muted-foreground">12ヶ月</span>
          </div>

          <div className="flex flex-col">
            {allMonths.map((item) => (
              <MonthRow
                key={item.month}
                month={item.month}
                index={item.index}
                summary={item.summary}
                isCurrentMonth={item.month === currentMonth}
                maxBalance={maxBalance}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
