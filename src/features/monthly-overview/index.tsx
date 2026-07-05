'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { AnimatedYen } from '@/components/animations/animated-number'
import { CopyMonthDialog } from '@/features/copy-month'
import { ExportCsvButton } from '@/features/export-csv'
import { HeaderActions } from '@/components/layout/header-actions'
import { labelSlide, motionDuration, motionEase } from '@/components/animations/tokens'
import {
  calculateSettlement,
  getSettlementDirectionLabel,
} from '@/lib/utils/calculation'
import { calculateMonthBalance } from '@/lib/utils/monthly-summary'
import {
  addMonths,
  formatCurrency,
  formatMonth,
  formatMonthDot,
  getDaysInMonth,
  getPreviousMonth,
  parseMonth,
  monthToPath,
} from '@/lib/utils/format'
import type { Income, Expense, Carryover } from '@/types'

interface HeroSectionProps {
  currentMonth: string
  incomes: Income[]
  expenses: Expense[]
  carryovers: Carryover[]
  children?: React.ReactNode
}

function useMonthDirection(currentMonth: string) {
  const [state, setState] = useState({ prev: currentMonth, direction: 0 })
  if (state.prev !== currentMonth) {
    setState({
      prev: currentMonth,
      direction: currentMonth > state.prev ? 1 : -1,
    })
  }
  return state.direction
}

const monthLabelVariants = {
  enter: (d: number) => ({ x: d * labelSlide, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -labelSlide, opacity: 0 }),
}

export function HeroSection({
  currentMonth,
  incomes,
  expenses,
  carryovers,
  children,
}: HeroSectionProps) {
  const router = useRouter()
  const direction = useMonthDirection(currentMonth)
  const previousMonth = getPreviousMonth(currentMonth)

  const result = calculateSettlement(incomes, expenses, carryovers)
  const { expenseTotal: allExpenseTotal, balance: monthlyBalance } =
    calculateMonthBalance(incomes, expenses)

  const totalItems = incomes.length + expenses.length
  const days = getDaysInMonth(currentMonth)
  const m = parseInt(currentMonth.slice(4, 6), 10)

  function navigateMonth(offset: number) {
    router.push(monthToPath(addMonths(currentMonth, offset)))
  }

  function goToCurrentMonth() {
    router.push(monthToPath(parseMonth(new Date())))
  }

  return (
    <section className="relative overflow-hidden border-b bg-gradient-to-b from-sky-50 via-background to-orange-50/70 dark:from-sky-950/25 dark:via-background dark:to-orange-950/15">
      <div className="relative flex flex-col gap-3 pt-[calc(env(safe-area-inset-top)+16px)] px-5 pb-7">
        {/* Header — 月一覧と同じ */}
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold tracking-[1px] text-sky-900 uppercase dark:text-white">
            Score Splitter
          </span>
          <HeaderActions variant="hero" />
        </div>

        {/* Nav — 一覧へ戻る + 月ナビ */}
        <div className="flex items-center justify-between">
          <Link
            href={`/${currentMonth.slice(0, 4)}`}
            aria-label="月の一覧へ戻る"
            className="inline-flex items-center gap-1 text-sky-900/70 text-xs hover:text-sky-950 transition-colors shrink-0 dark:text-white/70 dark:hover:text-white"
          >
            <span>←</span>
            <span>一覧へ</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="月ナビゲーション">
            <button
              type="button"
              aria-label="前月に移動"
              onClick={() => navigateMonth(-1)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-sky-900/75 transition-colors hover:bg-sky-100/80 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600/40 dark:text-white/75 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-white/60"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToCurrentMonth}
              aria-label="今月に移動"
              aria-live="polite"
              className="inline-flex h-11 min-w-[88px] items-center justify-center overflow-hidden rounded-full text-center text-[13px] font-semibold text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600/40 dark:text-white dark:focus-visible:ring-white/60"
            >
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.span
                  key={currentMonth}
                  custom={direction}
                  variants={monthLabelVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: motionDuration.fast, ease: motionEase.out }}
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
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-sky-900/75 transition-colors hover:bg-sky-100/80 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600/40 dark:text-white/75 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-white/60"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
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


        {/* 区切り線 */}
        <div className="h-px bg-sky-900/10 w-full dark:bg-white/10" />

        {/* Balance */}
        <div className="flex flex-col items-center gap-1.5 py-3">
          <span className="text-[10px] font-semibold tracking-[0.8px] text-sky-900/65 uppercase dark:text-white/70">
            Balance / 月の収支
          </span>
          <span className="text-sm font-medium font-mono text-sky-900/50 dark:text-white/50">
            {formatMonthDot(currentMonth)}
          </span>
          <AnimatedYen
            value={monthlyBalance}
            className="text-4xl font-bold font-mono text-slate-950 tracking-tight dark:text-white"
          />
          <span className="text-[11px] text-sky-900/65 dark:text-white/70">
            収入 {formatCurrency(result.totalIncome)} − 支出 {formatCurrency(allExpenseTotal, { absolute: true })}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-sky-100/80 text-[10px] text-sky-950 dark:bg-white/10 dark:text-white/80">
            {m}月1日 — {days}日間 / {totalItems}件の取引
          </span>
        </div>

        {/* Mini Cards */}
        <div className="flex gap-2.5">
          {/* Allowance */}
          <div className="flex-1 rounded-[12px] border border-sky-100/70 bg-background/90 p-3 shadow-sm dark:border-white/10 dark:bg-card/90">
            <span className="text-[9px] font-medium tracking-[0.5px] text-muted-foreground uppercase block">
              Allowance / お小遣い
            </span>
            <AnimatedYen
              value={result.allowance}
              className="text-lg font-bold font-mono text-foreground mt-1 block"
            />
          </div>

          {/* Settlement */}
          <div className="flex-1 rounded-[12px] border border-sky-100/70 bg-background/90 p-3 shadow-sm dark:border-white/10 dark:bg-card/90">
            <span className="text-[9px] font-medium tracking-[0.5px] text-muted-foreground uppercase block">
              Settlement / 精算額
            </span>
            {result.settlement !== 0 ? (
              <div className="flex items-center gap-2 mt-1">
                <AnimatedYen
                  value={result.settlement}
                  absolute
                  className="text-lg font-bold font-mono text-foreground"
                />
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg bg-accent/10 text-[8px] font-semibold text-accent">
                  {getSettlementDirectionLabel(result.settlement)}
                </span>
              </div>
            ) : (
              <span className="text-lg font-bold font-mono text-muted-foreground mt-1 block">
                精算なし
              </span>
            )}
          </div>
        </div>

        {children && (
          <div className="pt-2 pb-4">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
