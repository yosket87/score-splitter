'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { DeleteButton } from '@/components/ui/delete-button'
import { AddEntryModal } from '@/features/add-entry'
import { EditModal } from '@/features/edit-entry'
import { LottiePlayer } from '@/components/animations/lottie-player'
import { listExit, listSpring } from '@/components/animations/tokens'
import { updateExpense, deleteExpense, toggleExpenseCarryover } from '@/app/actions/expense'
import { formatCurrency } from '@/lib/utils/format'
import type { Expense } from '@/types'

interface ExpenseSectionProps {
  expenses: Expense[]
  month: string
}

function CarryoverToggleButton({ expense }: { expense: Expense }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`-m-2 flex h-11 w-11 items-center justify-center rounded-full text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed ${
        expense.isCarryover
          ? 'text-accent bg-accent/10'
          : 'text-muted-foreground hover:text-accent hover:bg-accent/10'
      }`}
      aria-label={expense.isCarryover ? `${expense.label}の繰越を解除` : `${expense.label}を繰越にする`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        expense.isCarryover ? '↩' : '↪'
      )}
    </button>
  )
}

export function ExpenseSection({ expenses, month }: ExpenseSectionProps) {
  const carryoverExpenses = expenses.filter((e) => e.isCarryover)
  const actualTotal = expenses.filter((e) => !e.isCarryover).reduce((sum, e) => sum + e.amount, 0)

  return (
    <div data-section="expense">
      <div className="flex items-baseline justify-between pb-2 mb-1">
        <h3 className="text-[11px] font-bold tracking-[0.8px] text-foreground uppercase">
          Expense / 支出
        </h3>
        <span className="text-[11px] text-[#999999]">
          {expenses.length}件{carryoverExpenses.length > 0 && ` — 繰越 ${carryoverExpenses.length}件`}
        </span>
      </div>

      <div className="rounded-[18px] bg-card shadow-soft overflow-hidden">
        <div className="border-b border-[#E5E7EB]" />
        <AnimatePresence initial={false}>
          {expenses.map((expense, i) => (
            <motion.div
              key={expense.id}
              data-testid="item-row"
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: expense.isCarryover ? 0.55 : 1, y: 0 }}
              exit={{ opacity: 0, x: -8, transition: listExit }}
              transition={listSpring}
              className={`group grid grid-cols-[22px_1fr_auto] gap-3 px-3.5 py-3 items-center ${
                i < expenses.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              <span
                className={`w-[22px] h-[22px] rounded-full text-white text-[8px] font-bold inline-flex items-center justify-center shrink-0 ${
                  expense.person === 'husband' ? 'bg-husband' : 'bg-wife'
                } ${expense.isCarryover ? 'opacity-50' : ''}`}
              >
                {expense.person === 'husband' ? '夫' : '妻'}
              </span>
              <span className={`text-[13px] font-medium truncate ${expense.isCarryover ? 'text-[#999999]' : ''}`}>
                {expense.label}
                {expense.isCarryover && (
                  <span className="ml-1.5 text-[8px] px-1.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] font-bold">繰越</span>
                )}
              </span>
              <div className="flex items-center gap-1">
                <span className={`font-mono text-[13px] font-semibold ${
                  expense.isCarryover ? 'text-[#999999]' : 'text-[#E2483D]'
                }`}>
                  {formatCurrency(expense.amount, { absolute: expense.isCarryover })}
                </span>
                <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                  <form action={async () => {
                    const result = await toggleExpenseCarryover(expense.id, !expense.isCarryover)
                    if (!result.success) {
                      toast.error(result.error ?? '繰越フラグの更新に失敗しました')
                    }
                  }}>
                    <CarryoverToggleButton expense={expense} />
                  </form>
                  <EditModal
                    id={expense.id}
                    month={month}
                    label={expense.label}
                    amount={expense.amount}
                    person={expense.person}
                    type="expense"
                    isCarryover={expense.isCarryover}
                    onUpdate={updateExpense}
                  />
                  <DeleteButton
                    itemName={expense.label}
                    label={`${expense.label}を削除`}
                    onDelete={() => deleteExpense(expense.id)}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {expenses.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground animate-fade-in">
            <LottiePlayer
              src="/lottie/empty-box.json"
              className="w-12 h-12"
              ariaLabel="支出がありません"
            />
            <p className="text-xs">支出がありません</p>
          </div>
        )}

        <div className="border-t border-border bg-[var(--surface-total)] px-3.5 py-2.5">
          <AddEntryModal type="expense" month={month} />
        </div>

        <div className="flex items-baseline justify-between px-3.5 py-3 border-t border-border bg-[var(--surface-total)]">
          <span className="text-[11px] text-[#999999] font-semibold tracking-[0.8px] uppercase">
            Total
          </span>
          <span className="font-mono text-[15px] font-bold text-[#E2483D]">
            {formatCurrency(actualTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}
