'use client'

import { AnimatePresence, motion } from 'motion/react'
import { DeleteButton } from '@/components/ui/delete-button'
import { AddEntryModal } from '@/features/add-entry'
import { EditModal } from '@/features/edit-entry'
import { LottiePlayer } from '@/components/animations/lottie-player'
import { listExit, listSpring } from '@/components/animations/tokens'
import { updateIncome, deleteIncome } from '@/app/actions/income'
import { formatCurrency } from '@/lib/utils/format'
import type { Income } from '@/types'

interface IncomeSectionProps {
  incomes: Income[]
  month: string
}

export function IncomeSection({ incomes, month }: IncomeSectionProps) {
  const total = incomes.reduce((sum, i) => sum + i.amount, 0)

  return (
    <div data-section="income">
      <div className="flex items-baseline justify-between pb-2 mb-1">
        <h3 className="text-[11px] font-bold tracking-[0.8px] text-foreground uppercase">
          Income / 収入
        </h3>
        <span className="text-[11px] text-[#999999]">
          {incomes.length}件
        </span>
      </div>

      <div className="rounded-[18px] bg-card shadow-soft overflow-hidden">
        <div className="border-b border-[#E5E7EB]" />
        <AnimatePresence initial={false}>
          {incomes.map((income, i) => (
            <motion.div
              key={income.id}
              data-testid="item-row"
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -8, transition: listExit }}
              transition={listSpring}
              className={`group grid grid-cols-[22px_1fr_auto] gap-3 px-3.5 py-3 items-center ${
                i < incomes.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              <span
                className={`w-[22px] h-[22px] rounded-full text-white text-[8px] font-bold inline-flex items-center justify-center shrink-0 ${
                  income.person === 'husband' ? 'bg-husband' : 'bg-wife'
                }`}
              >
                {income.person === 'husband' ? '夫' : '妻'}
              </span>
              <span className="text-[13px] font-medium truncate">{income.label}</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[13px] font-semibold text-[#2563EB]">
                  +{formatCurrency(income.amount).slice(1)}
                </span>
                <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                  <EditModal
                    id={income.id}
                    month={month}
                    label={income.label}
                    amount={income.amount}
                    person={income.person}
                    type="income"
                    onUpdate={updateIncome}
                  />
                  <DeleteButton
                    itemName={income.label}
                    label={`${income.label}を削除`}
                    onDelete={() => deleteIncome(income.id)}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {incomes.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground animate-fade-in">
            <LottiePlayer
              src="/lottie/empty-box.json"
              className="w-12 h-12"
              ariaLabel="収入がありません"
            />
            <p className="text-xs">収入がありません</p>
          </div>
        )}

        <div className="border-t border-border bg-[var(--surface-total)] px-3.5 py-2.5">
          <AddEntryModal type="income" month={month} />
        </div>

        <div className="flex items-baseline justify-between px-3.5 py-3 border-t border-border bg-[var(--surface-total)]">
          <span className="text-[11px] text-[#999999] font-semibold tracking-[0.8px] uppercase">
            Total
          </span>
          <span className="font-mono text-[15px] font-bold text-[#2563EB]">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  )
}
