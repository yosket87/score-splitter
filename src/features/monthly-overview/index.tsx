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
import { useTheme } from 'next-themes'
import { labelSlide, motionDuration, motionEase } from '@/components/animations/tokens'
import {
  calculateSettlement,
  getSettlementDirectionLabel,
} from '@/lib/utils/calculation'
import { calculateMonthBalance } from '@/lib/utils/monthly-summary'
import { formatCurrency, formatMonth, getPreviousMonth, parseMonth, monthToPath } from '@/lib/utils/format'
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

function formatMonthDot(month: string): string {
  return `${month.slice(0, 4)}.${month.slice(4, 6)}`
}

function getDaysInMonth(month: string): number {
  const year = parseInt(month.slice(0, 4), 10)
  const m = parseInt(month.slice(4, 6), 10)
  return new Date(year, m, 0).getDate()
}

export function HeroSection({
  currentMonth,
  incomes,
  expenses,
  carryovers,
  children,
}: HeroSectionProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const direction = useMonthDirection(currentMonth)
  const previousMonth = getPreviousMonth(currentMonth)

  const result = calculateSettlement(incomes, expenses, carryovers)
  const { expenseTotal: allExpenseTotal, balance: monthlyBalance } =
    calculateMonthBalance(incomes, expenses)

  const totalItems = incomes.length + expenses.length
  const days = getDaysInMonth(currentMonth)
  const m = parseInt(currentMonth.slice(4, 6), 10)

  function navigateMonth(offset: number) {
    const year = parseInt(currentMonth.slice(0, 4), 10)
    const month = parseInt(currentMonth.slice(4, 6), 10)
    const date = new Date(year, month - 1 + offset, 1)
    router.push(monthToPath(parseMonth(date)))
  }

  function goToCurrentMonth() {
    router.push(monthToPath(parseMonth(new Date())))
  }

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: isDark
          ? `
            linear-gradient(to bottom, transparent 65%, #0F1117AA 85%, #0F1117 100%),
            radial-gradient(at 0% 0%, #1E2A6E 0%, transparent 50%),
            radial-gradient(at 50% 0%, #2A1F6E 0%, transparent 50%),
            radial-gradient(at 100% 0%, #1E3A8A 0%, transparent 50%),
            radial-gradient(at 0% 50%, #312E81 0%, transparent 50%),
            radial-gradient(at 50% 50%, #2E4A8E 0%, transparent 50%),
            radial-gradient(at 100% 50%, #1E5A8A 0%, transparent 50%),
            radial-gradient(at 0% 100%, #1E1B4B 0%, transparent 50%),
            radial-gradient(at 50% 100%, #172554 0%, transparent 50%),
            radial-gradient(at 100% 100%, #164E63 0%, transparent 50%)
          `
          : `
            linear-gradient(to bottom, transparent 65%, #FAFBFCAA 85%, #FAFBFC 100%),
            radial-gradient(at 0% 0%, #3454D1 0%, transparent 50%),
            radial-gradient(at 50% 0%, #4C3BCF 0%, transparent 50%),
            radial-gradient(at 100% 0%, #3B82F6 0%, transparent 50%),
            radial-gradient(at 0% 50%, #6366F1 0%, transparent 50%),
            radial-gradient(at 50% 50%, #5B8DEF 0%, transparent 50%),
            radial-gradient(at 100% 50%, #38BDF8 0%, transparent 50%),
            radial-gradient(at 0% 100%, #C7D2FE 0%, transparent 50%),
            radial-gradient(at 50% 100%, #DBEAFE 0%, transparent 50%),
            radial-gradient(at 100% 100%, #BAE6FD 0%, transparent 50%)
          `,
      }}
    >
      {/* 装飾blob */}
      <div className="absolute w-[180px] h-[180px] rounded-full bg-white opacity-[0.06] right-[-20px] top-[-40px] pointer-events-none" />
      <div className="absolute w-[120px] h-[120px] rounded-full bg-white opacity-[0.05] left-[-30px] top-[140px] pointer-events-none" />
      <div className="absolute w-[80px] h-[80px] rounded-full bg-[#A5B4FC] opacity-[0.08] right-[20px] bottom-[200px] pointer-events-none" />

      <div className="relative flex flex-col gap-3 pt-[calc(env(safe-area-inset-top)+16px)] px-5 pb-7">
        {/* Header — 月一覧と同じ */}
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold tracking-[1px] text-white uppercase">
            Score Splitter
          </span>
          <HeaderActions variant="hero" />
        </div>

        {/* Nav — 一覧へ戻る + 月ナビ */}
        <div className="flex items-center justify-between">
          <Link
            href={`/${currentMonth.slice(0, 4)}`}
            aria-label="月の一覧へ戻る"
            className="inline-flex items-center gap-1 text-white/70 text-xs hover:text-white transition-colors shrink-0"
          >
            <span>←</span>
            <span>一覧へ</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="月ナビゲーション">
            <button
              type="button"
              aria-label="前月に移動"
              onClick={() => navigateMonth(-1)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToCurrentMonth}
              aria-label="今月に移動"
              aria-live="polite"
              className="inline-flex h-11 min-w-[88px] items-center justify-center overflow-hidden rounded-full text-center text-[13px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
        <div className="h-px bg-white/10 w-full" />

        {/* Balance */}
        <div className="flex flex-col items-center gap-1.5 py-3">
          <span className="text-[10px] font-semibold tracking-[0.8px] text-white/70 uppercase">
            Balance / 月の収支
          </span>
          <span className="text-sm font-medium font-mono text-white/50">
            {formatMonthDot(currentMonth)}
          </span>
          <AnimatedYen
            value={monthlyBalance}
            className="text-4xl font-bold font-mono text-white tracking-tight"
          />
          <span className="text-[11px] text-white/70">
            収入 {formatCurrency(result.totalIncome)} − 支出 {formatCurrency(Math.abs(allExpenseTotal))}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 text-[10px] text-white/80">
            {m}月1日 — {days}日間 / {totalItems}件の取引
          </span>
        </div>

        {/* Mini Cards */}
        <div className="flex gap-2.5">
          {/* Allowance */}
          <div className="flex-1 rounded-[12px] bg-card shadow-sm p-3">
            <span className="text-[9px] font-medium tracking-[0.5px] text-muted-foreground uppercase block">
              Allowance / お小遣い
            </span>
            <AnimatedYen
              value={result.allowance}
              className="text-lg font-bold font-mono text-foreground mt-1 block"
            />
          </div>

          {/* Settlement */}
          <div className="flex-1 rounded-[12px] bg-card shadow-sm p-3">
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
