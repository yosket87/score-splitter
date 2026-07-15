'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { AnimatedYen } from '@/components/animations/animated-number'
import { useMotionPrefs } from '@/components/animations/use-motion-prefs'
import { TrendCard } from '@/components/charts/trend-card'
import { CopyMonthDialog } from '@/features/copy-month'
import { ExportCsvButton } from '@/features/export-csv'
import {
  calculateSettlement,
  getSettlementDirectionLabel,
} from '@/lib/utils/calculation'
import { calculateMonthBalance } from '@/lib/utils/monthly-summary'
import {
  addMonths,
  formatCurrency,
  formatMonth,
  getDaysInMonth,
  getPreviousMonth,
  monthToPath,
  parseMonth,
} from '@/lib/utils/format'
import type { Carryover, Expense, Income, MonthlySummary } from '@/types'

export interface MonthlyOverviewSummary {
  incomes: Income[]
  expenses: Expense[]
  carryovers: Carryover[]
}

interface MonthlyOverviewProps {
  year: number
  month: number
  summary: MonthlyOverviewSummary
  summaries: MonthlySummary[]
}

function toCurrentMonth(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}`
}

function useMonthDirection(currentMonth: string): number {
  const [state, setState] = useState({
    currentMonth,
    direction: 0,
  })

  if (state.currentMonth !== currentMonth) {
    setState({
      currentMonth,
      direction: currentMonth > state.currentMonth ? 1 : -1,
    })
  }

  return state.direction
}

export function MonthlyOverview({
  year,
  month,
  summary,
  summaries,
}: MonthlyOverviewProps) {
  const router = useRouter()
  const { reduced } = useMotionPrefs()
  const currentMonth = toCurrentMonth(year, month)
  const direction = useMonthDirection(currentMonth)
  const previousMonth = getPreviousMonth(currentMonth)
  const { incomes, expenses, carryovers } = summary

  const result = calculateSettlement(incomes, expenses, carryovers)
  const { expenseTotal, balance } = calculateMonthBalance(incomes, expenses)
  const settlementDirection = getSettlementDirectionLabel(result.settlement)
  const settlementLabel =
    result.settlement === 0
      ? '精算額 精算なし'
      : `精算額 ${formatCurrency(result.settlement, { absolute: true })} ${settlementDirection}`
  const transactionCount = incomes.length + expenses.length

  const monthVariants = reduced
    ? {
        enter: { x: 0, opacity: 1 },
        center: { x: 0, opacity: 1 },
        exit: { x: 0, opacity: 1 },
      }
    : {
        enter: (value: number) => ({ x: value * 14, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (value: number) => ({ x: value * -14, opacity: 0 }),
      }

  const monthTransition = reduced
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.28, bounce: 0 }

  function navigateMonth(offset: number) {
    router.push(monthToPath(addMonths(currentMonth, offset)))
  }

  function goToCurrentMonth() {
    router.push(monthToPath(parseMonth(new Date())))
  }

  return (
    <section aria-label="月次要約" className="space-y-4">
      <div className="app-glass-heavy overflow-hidden rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav
            className="flex items-center gap-1"
            aria-label="月ナビゲーション"
          >
            <button
              type="button"
              aria-label="前月に移動"
              onClick={() => navigateMonth(-1)}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={goToCurrentMonth}
              aria-label="今月に移動"
              aria-live="polite"
              className="inline-flex h-11 min-w-[104px] cursor-pointer items-center justify-center overflow-hidden rounded-full px-2 text-center text-sm font-semibold focus-visible:outline-none"
            >
              <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                <motion.span
                  key={currentMonth}
                  custom={direction}
                  variants={monthVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={monthTransition}
                  className="inline-block"
                >
                  {formatMonth(currentMonth)}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              type="button"
              aria-label="翌月に移動"
              onClick={() => navigateMonth(1)}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
            >
              <ChevronRight className="size-5" />
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <CopyMonthDialog
              currentMonth={currentMonth}
              previousMonth={previousMonth}
            />
            <ExportCsvButton
              currentMonth={currentMonth}
              incomes={incomes}
              expenses={expenses}
              carryovers={carryovers}
            />
          </div>
        </div>

        <div className="my-4 h-px bg-border" />

        <div className="flex flex-col items-center py-3 text-center">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">
            精算額
          </p>
          <h1
            aria-label={settlementLabel}
            className="mt-2 flex flex-col items-center gap-2"
          >
            {result.settlement === 0 ? (
              <span className="font-mono text-4xl font-bold tracking-tight text-muted-foreground">
                精算なし
              </span>
            ) : (
              <>
                <AnimatedYen
                  value={result.settlement}
                  absolute
                  className="font-mono text-4xl font-bold tracking-tight text-foreground sm:text-5xl"
                />
                <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                  {settlementDirection}
                </span>
              </>
            )}
          </h1>
        </div>

        <div className="mt-4 grid gap-3">
          <section
            aria-labelledby="monthly-balance-label"
            className="app-solid-panel rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="monthly-balance-label"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  月収支
                </h2>
                <AnimatedYen
                  value={balance}
                  className="mt-1 block font-mono text-2xl font-bold font-tabular"
                />
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {getDaysInMonth(currentMonth)}日間・{transactionCount}件
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              収入 {formatCurrency(result.totalIncome)} − 支出{' '}
              {formatCurrency(expenseTotal, { absolute: true })}
            </p>
          </section>

          <section
            aria-labelledby="allowance-label"
            className="app-solid-panel rounded-2xl p-4"
          >
            <h2
              id="allowance-label"
              className="text-xs font-semibold text-muted-foreground"
            >
              お小遣い
            </h2>
            <AnimatedYen
              value={result.allowance}
              className="mt-1 block font-mono text-2xl font-bold font-tabular"
            />
            <p className="mt-1 text-xs text-muted-foreground">1人あたり</p>
          </section>
        </div>
      </div>

      <TrendCard summaries={summaries} currentMonth={currentMonth} />
    </section>
  )
}

export type { MonthlyOverviewProps }
