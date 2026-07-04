'use client'

import { motion } from 'motion/react'
import { barSpring } from '@/components/animations/tokens'
import type { MonthlySummary } from '@/types'

interface YearlyBarChartProps {
  summaries: MonthlySummary[]
  year: number
}

export function YearlyBarChart({ summaries, year }: YearlyBarChartProps) {
  const summaryMap = new Map(summaries.map((s) => [s.month, s]))

  const maxVal = summaries.reduce((max, s) => {
    return Math.max(max, Math.abs(s.balance))
  }, 1)

  const months = Array.from({ length: 12 }, (_, i) => {
    const monthStr = `${year}${String(i + 1).padStart(2, '0')}`
    return { month: monthStr, label: String(i + 1), summary: summaryMap.get(monthStr) }
  })

  return (
    <div
      className="flex flex-col gap-2"
      role="img"
      aria-label={`${year}年の月次収支推移グラフ`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground">
          月次推移 / 1月〜12月
        </span>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            プラス
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            マイナス
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1">
        {months.map(({ month, summary }) => {
          if (!summary) {
            return (
              <div key={month} className="flex-1 flex items-end justify-center h-[80px]">
                <div className="w-full rounded-sm bg-chart-bar-muted h-2" />
              </div>
            )
          }

          const h = Math.max((Math.abs(summary.balance) / maxVal) * 80, 4)
          const isPositive = summary.balance >= 0

          return (
            <div key={month} className="flex-1 flex items-end justify-center h-[80px]">
              <motion.div
                className={`w-full rounded-sm ${isPositive ? 'bg-accent' : 'bg-destructive'}`}
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={barSpring}
              />
            </div>
          )
        })}
      </div>

      <div className="flex gap-1">
        {months.map(({ month, label }) => (
          <span
            key={month}
            className="flex-1 text-center text-[8px] font-mono font-medium text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
