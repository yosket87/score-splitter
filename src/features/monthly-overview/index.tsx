'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { AnimatedYen } from '@/components/animations/animated-number'
import { CopyMonthDialog } from '@/features/copy-month'
import { ExportCsvButton } from '@/features/export-csv'
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
    <section className="relative overflow-hidden bg-hero-tile">
      <div className="relative flex flex-col gap-3 pt-2 px-5 pb-10 max-w-4xl mx-auto">
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
        <div className="flex flex-col items-center gap-1.5 py-6">
          <span className="text-eyebrow text-white/70">
            Balance / 月の収支
          </span>
          <span className="text-sm font-medium font-mono text-white/50">
            {formatMonthDot(currentMonth)}
          </span>
          <AnimatedYen
            value={monthlyBalance}
            className="text-5xl md:text-6xl font-bold font-mono text-white tracking-tight"
          />
          <span className="text-[13px] text-white/70 mt-1">
            収入 {formatCurrency(result.totalIncome)} − 支出 {formatCurrency(allExpenseTotal, { absolute: true })}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 text-[10px] text-white/80">
            {m}月1日 — {days}日間 / {totalItems}件の取引
          </span>
        </div>

        {/* Stats — ヘアライン区切りのフラット統計行 */}
        <div className="grid grid-cols-2">
          {/* Allowance */}
          <div className="flex flex-col gap-1 px-3">
            <span className="text-eyebrow text-white/50">
              Allowance / お小遣い
            </span>
            <AnimatedYen
              value={result.allowance}
              className="text-lg font-bold font-mono text-white"
            />
          </div>

          {/* Settlement */}
          <div className="flex flex-col gap-1 px-3 border-l border-white/10">
            <span className="text-eyebrow text-white/50">
              Settlement / 精算額
            </span>
            {result.settlement !== 0 ? (
              <div className="flex items-center gap-2">
                <AnimatedYen
                  value={result.settlement}
                  absolute
                  className="text-lg font-bold font-mono text-white"
                />
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-white/80">
                  {getSettlementDirectionLabel(result.settlement)}
                </span>
              </div>
            ) : (
              <span className="text-lg font-bold font-mono text-white/50">
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
