'use client'

import { motion } from 'motion/react'
import { barSpring } from '@/components/animations/tokens'
import { useMotionPrefs } from '@/components/animations/use-motion-prefs'
import type { MonthlySummary } from '@/types'

interface MiniBarChartProps {
  summaries: MonthlySummary[]
  currentMonth: string
}

export function MiniBarChart({ summaries, currentMonth }: MiniBarChartProps) {
  const { reduced } = useMotionPrefs()
  const transition = reduced ? { duration: 0 } : barSpring

  if (summaries.length === 0) return null

  const maxBalance = Math.max(...summaries.map((s) => Math.abs(s.balance)), 1)

  const sorted = [...summaries].sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div>
      <div className="text-eyebrow text-sub-text">
        過去{sorted.length}ヶ月のトレンド
      </div>
      <div
        className="flex items-end gap-1.5 mt-2 h-[100px] md:h-[160px]"
        role="img"
        aria-label={`過去${sorted.length}ヶ月の収支トレンドチャート`}
      >
        {sorted.map((s) => {
          const heightPct = Math.max((Math.abs(s.balance) / maxBalance) * 100, 4)
          const isCurrent = s.month === currentMonth
          const isPositive = s.balance >= 0

          return (
            <motion.div
              key={s.month}
              className="flex-1 rounded-t"
              style={{
                backgroundColor: isCurrent
                  ? 'var(--accent)'
                  : isPositive
                    ? 'var(--chart-bar-muted)'
                    : 'var(--destructive-soft)',
              }}
              initial={{ height: 0 }}
              animate={{ height: `${heightPct}%` }}
              transition={transition}
            />
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {sorted.map((s) => {
          const m = parseInt(s.month.slice(4, 6), 10)
          return (
            <div
              key={s.month}
              className="flex-1 text-center text-[9px] text-sub-text font-tabular md:text-[10px]"
            >
              {m}月
            </div>
          )
        })}
      </div>
    </div>
  )
}
