'use client'

import { motion } from 'motion/react'
import { barSpring } from '@/components/animations/tokens'
import type { MonthlySummary } from '@/types'

interface TrendCardProps {
  summaries: MonthlySummary[]
  currentMonth: string
}

function formatShortMonth(month: string): string {
  const m = parseInt(month.slice(4, 6), 10)
  return `${m}月`
}

export function TrendCard({ summaries, currentMonth }: TrendCardProps) {
  if (summaries.length === 0) return null

  const maxVal = summaries.reduce((max, s) => {
    return Math.max(max, s.incomeTotal, Math.abs(s.expenseTotal))
  }, 1)

  return (
    <div
      className="border-t border-white/10 pt-4 px-1"
      role="img"
      aria-label={`直近${summaries.length}ヶ月の収入と支出の推移グラフ`}
    >
      <div className="flex items-center justify-between">
        <span className="text-eyebrow text-white/50">
          Trend / 推移
        </span>
        <span className="text-[10px] font-medium text-white/50">
          直近{summaries.length}ヶ月
        </span>
      </div>

      <div className="flex items-center justify-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-hero-income" />
          <span className="text-[9px] text-white/60">収入</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-hero-expense" />
          <span className="text-[9px] text-white/60">支出</span>
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-[100px] mt-3 px-2">
        {summaries.map((s) => {
          const incomeH = (s.incomeTotal / maxVal) * 100
          const expenseH = (Math.abs(s.expenseTotal) / maxVal) * 100
          const isCurrent = s.month === currentMonth

          return (
            <div key={s.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="flex items-end gap-[3px] h-[84px] w-full justify-center">
                <motion.div
                  className={`w-2 rounded-t-[3px] bg-hero-income ${isCurrent ? '' : 'opacity-60'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${incomeH}%` }}
                  transition={barSpring}
                />
                <motion.div
                  className={`w-2 rounded-t-[3px] bg-hero-expense ${isCurrent ? '' : 'opacity-60'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${expenseH}%` }}
                  transition={barSpring}
                />
              </div>
              <span className={`text-[8px] font-mono ${isCurrent ? 'text-white font-bold' : 'text-white/50'}`}>
                {formatShortMonth(s.month)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
