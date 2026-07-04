'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MonthRow } from './components/month-row'
import { YearlyBarChart } from '@/components/charts/yearly-bar-chart'
import { formatCurrency, parseMonth, monthToPath } from '@/lib/utils/format'
import type { MonthlySummary } from '@/types'

interface MonthlyListSectionProps {
  summaries: MonthlySummary[]
  year: number
}

export function MonthlyListSection({ summaries, year }: MonthlyListSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const currentMonth = parseMonth(new Date())

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-muted-foreground">まだ記録がありません。</p>
        <Link
          href={monthToPath(currentMonth)}
          className="text-accent underline-offset-4 hover:underline"
        >
          今月の画面を開く
        </Link>
      </div>
    )
  }

  const availableYears = [...new Set(summaries.map((s) => Number(s.month.slice(0, 4))))].sort()
  if (!availableYears.includes(year)) {
    availableYears.push(year)
    availableYears.sort()
  }

  const yearSummaries = summaries.filter((s) =>
    s.month.startsWith(String(year))
  )
  const recordedCount = yearSummaries.length
  const balanceYTD = yearSummaries.reduce((sum, s) => sum + s.balance, 0)
  const incomeYTD = yearSummaries.reduce((sum, s) => sum + s.incomeTotal, 0)
  const expenseYTD = yearSummaries.reduce(
    (sum, s) => sum + Math.abs(s.expenseTotal),
    0
  )

  const allMonths = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}${String(i + 1).padStart(2, '0')}`
    return {
      month: m,
      index: i + 1,
      summary: yearSummaries.find((s) => s.month === m) ?? null,
    }
  })

  const maxBalance = Math.max(
    ...yearSummaries.map((s) => Math.abs(s.balance)),
    1
  )

  const isBalancePositive = balanceYTD >= 0

  return (
    <section aria-label="月の一覧">
      {/* セクションヘッド */}
      <div className="pb-4">
        <div className="text-[11px] font-medium tracking-[0.5px] text-muted-foreground uppercase">
          Months / 月一覧
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="text-4xl font-bold leading-none">
            {year}
          </div>
          {/* pill型セレクター */}
          <select
            value={year}
            onChange={(e) => startTransition(() => router.push(`/${e.target.value}`))}
            disabled={isPending}
            className={`rounded-lg border border-border px-3 py-1.5 text-sm font-medium bg-transparent appearance-none cursor-pointer transition-opacity ${isPending ? 'opacity-50' : ''}`}
            aria-label="年を選択"
            style={{ backgroundImage: 'none' }}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">▾</span>
        </div>
        <p className="text-[13px] text-muted-foreground mt-2">
          {recordedCount > 0
            ? `${recordedCount}ヶ月分の記録があります`
            : 'この年の記録はまだありません'}
        </p>
      </div>

      {/* Year-to-Date カード */}
      {recordedCount > 0 && (
        <div className="rounded-[16px] shadow-soft p-5">
          <div className="text-[10px] font-medium tracking-[0.5px] text-muted-foreground uppercase">
            Year-to-Date / 年間収支
          </div>
          <div className="mt-1">
            <span
              className={`font-mono text-[28px] font-bold ${
                isBalancePositive ? 'text-accent' : 'text-destructive'
              }`}
            >
              {formatCurrency(balanceYTD, { signed: true })}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-[11px] font-medium text-sub-text">
              Income {formatCurrency(incomeYTD)}
            </span>
            <span className="font-mono text-[11px] font-medium text-sub-text">
              Expense {formatCurrency(expenseYTD)}
            </span>
          </div>

          {/* 年間バーチャート */}
          <div className="mt-4">
            <YearlyBarChart summaries={yearSummaries} year={year} />
          </div>
        </div>
      )}

      {/* 注記 */}
      <p className="text-xs text-muted-foreground py-3">
        ※各月の収支は繰越に回す前の金額です
      </p>

      {/* BY MONTH ヘッダー */}
      <div className="flex items-baseline justify-between py-2">
        <span className="text-[11px] font-medium tracking-[0.5px] text-muted-foreground uppercase">
          By Month / 月別
        </span>
        <span className="text-[11px] text-muted-foreground">
          12ヶ月
        </span>
      </div>

      {/* 月リスト */}
      <div className="flex flex-col">
        {allMonths.map((m) => (
          <MonthRow
            key={m.month}
            month={m.month}
            index={m.index}
            summary={m.summary}
            isCurrentMonth={m.month === currentMonth}
            maxBalance={maxBalance}
          />
        ))}
      </div>
    </section>
  )
}
