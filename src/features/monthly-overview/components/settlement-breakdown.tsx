'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { getSettlementDirectionLabel } from '@/lib/utils/calculation'
import { formatCurrency } from '@/lib/utils/format'
import type { CalculationResult } from '@/types'

interface SettlementBreakdownProps {
  result: CalculationResult
  hasClearedCarryovers: boolean
}

function formatBreakdownCurrency(amount: number): string {
  if (Number.isInteger(amount)) return formatCurrency(amount)
  return `${amount < 0 ? '−' : ''}¥${Math.abs(amount).toLocaleString('ja-JP')}`
}

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all font-mono font-semibold text-foreground tabular-nums">
        {formatBreakdownCurrency(amount)}
      </dd>
    </div>
  )
}

export function SettlementBreakdown({
  result,
  hasClearedCarryovers,
}: SettlementBreakdownProps) {
  const people = [
    {
      label: '夫',
      color: 'text-husband',
      income: result.husbandIncome,
      expense: result.husbandExpense,
      total: result.husbandTotal,
    },
    {
      label: '妻',
      color: 'text-wife',
      income: result.wifeIncome,
      expense: result.wifeExpense,
      total: result.wifeTotal,
    },
  ]
  const hasFraction =
    !Number.isInteger(result.allowance) || !Number.isInteger(result.settlement)

  return (
    <Collapsible.Root className="mt-3 rounded-2xl border border-border">
      <Collapsible.Trigger className="group flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        精算の内訳
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180"
        />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div className="space-y-4 px-4 pb-4 text-sm">
          {people.map((person) => (
            <section key={person.label} aria-label={`${person.label}の内訳`}>
              <h3 className={`mb-2 font-semibold ${person.color}`}>
                {person.label}
              </h3>
              <dl className="space-y-2">
                <AmountRow label="収入" amount={person.income} />
                <AmountRow label="精算対象の支出" amount={person.expense} />
                <AmountRow label="差引" amount={person.total} />
              </dl>
            </section>
          ))}
          {hasClearedCarryovers && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              精算対象の支出には、今月清算する繰越を含みます
            </p>
          )}
          <dl className="space-y-3 border-t border-border pt-3">
            <AmountRow label="1人あたりのお小遣い" amount={result.allowance} />
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">精算額</dt>
              <dd className="min-w-0 text-right text-foreground">
                {result.settlement === 0 ? (
                  '精算不要'
                ) : (
                  <>
                    <span className="block break-all font-mono font-semibold tabular-nums">
                      {formatBreakdownCurrency(Math.abs(result.settlement))}
                    </span>
                    <span className="text-xs">
                      {getSettlementDirectionLabel(result.settlement)}
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>
          {hasFraction && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              計算上の金額です。上部の表示は1円未満を切り捨てています
            </p>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
