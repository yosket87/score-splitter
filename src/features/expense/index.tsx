'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SectionShell, EntryRow } from '@/components/entry-section'
import { DeleteButton } from '@/components/ui/delete-button'
import { AddEntryModal } from '@/features/add-entry'
import { EditModal } from '@/features/edit-entry'
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
    <SectionShell
      dataSection="expense"
      title="Expense / 支出"
      meta={`${expenses.length}件${carryoverExpenses.length > 0 ? ` — 繰越 ${carryoverExpenses.length}件` : ''}`}
      isEmpty={expenses.length === 0}
      emptyLabel="支出がありません"
      addSlot={<AddEntryModal type="expense" month={month} />}
      totalSlot={
        <div className="flex items-baseline justify-between px-3.5 py-3 border-t border-border bg-[var(--surface-total)]">
          <span className="text-[11px] text-muted-foreground font-semibold tracking-[0.8px] uppercase">
            Total
          </span>
          <span className="font-mono text-[15px] font-bold text-destructive">
            {formatCurrency(actualTotal)}
          </span>
        </div>
      }
    >
      {expenses.map((expense, i) => (
        <EntryRow
          key={expense.id}
          id={expense.id}
          label={expense.label}
          person={expense.person}
          amount={formatCurrency(expense.amount, { absolute: expense.isCarryover })}
          amountClassName={expense.isCarryover ? 'text-muted-foreground' : 'text-destructive'}
          labelClassName={expense.isCarryover ? 'text-muted-foreground' : undefined}
          personBadgeClassName={expense.isCarryover ? 'opacity-50' : undefined}
          labelBadge={
            expense.isCarryover ? (
              <span className="ml-1.5 text-[8px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold">
                繰越
              </span>
            ) : undefined
          }
          opacity={expense.isCarryover ? 0.55 : 1}
          isLast={i === expenses.length - 1}
          actions={
            <>
              <form action={async () => {
                const result = await toggleExpenseCarryover(
                  expense.id,
                  !expense.isCarryover,
                  month
                )
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
                onDelete={() => deleteExpense(expense.id, month)}
              />
            </>
          }
        />
      ))}
    </SectionShell>
  )
}
