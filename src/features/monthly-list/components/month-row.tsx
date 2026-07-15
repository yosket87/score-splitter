import Link from 'next/link'
import { formatCurrency, formatMonth, monthToPath } from '@/lib/utils/format'
import type { MonthlySummary } from '@/types'

interface MonthRowProps {
  month: string
  index: number
  summary: MonthlySummary | null
  isCurrentMonth: boolean
  maxBalance: number
}

export function MonthRow({
  month,
  index,
  summary,
  isCurrentMonth,
  maxBalance,
}: MonthRowProps) {
  const monthNumber = String(index).padStart(2, '0')

  if (!summary) {
    return (
      <div className="flex items-center gap-2.5 py-3.5 border-b border-border">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">
          {monthNumber}
        </span>
        <div className="flex-1">
          <span className="text-base font-semibold text-muted-foreground">{index}月</span>
        </div>
        <span className="text-[11px] text-muted-foreground">未記録</span>
      </div>
    )
  }

  const isPositive = summary.balance >= 0
  const barWidth = Math.min(
    (Math.abs(summary.balance) / maxBalance) * 80,
    80
  )

  return (
    <Link
      href={monthToPath(month)}
      aria-label={`${formatMonth(month)}の詳細を開く`}
      className="flex items-center gap-2.5 py-3.5 border-b border-border transition-[color,background-color,transform] active:scale-[0.99] active:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {/* 月番号 */}
      <span className="font-mono text-[11px] font-medium text-muted-foreground">
        {monthNumber}
      </span>

      {/* 中央部 */}
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base font-semibold">{index}月</span>
          {isCurrentMonth && (
            <span className="bg-accent/10 text-accent text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
              今月
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">
          収入 {formatCurrency(summary.incomeTotal)} · 支出 {formatCurrency(summary.expenseTotal, { absolute: true })}
        </div>
        {/* バランスバー */}
        <div
          className={`h-[3px] rounded-sm mt-0.5 ${
            isPositive ? 'bg-accent' : 'bg-destructive'
          }`}
          style={{ width: `${Math.max(barWidth, 4)}px` }}
        />
      </div>

      {/* 右側 */}
      <div className="flex flex-col items-end gap-0.5">
        <span
          className={`font-mono text-[13px] font-semibold ${
            isPositive ? 'text-accent' : 'text-destructive'
          }`}
        >
          {formatCurrency(summary.balance, { signed: true })}
        </span>
        <span className="text-[10px] font-medium text-accent">
          詳細 &gt;
        </span>
      </div>
    </Link>
  )
}
