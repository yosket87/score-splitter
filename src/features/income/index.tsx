'use client'

import { SectionShell, EntryRow } from '@/components/entry-section'
import { DeleteButton } from '@/components/ui/delete-button'
import { AddEntryModal } from '@/features/add-entry'
import { EditModal } from '@/features/edit-entry'
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
    <SectionShell
      dataSection="income"
      title="Income / 収入"
      meta={`${incomes.length}件`}
      isEmpty={incomes.length === 0}
      emptyLabel="収入がありません"
      addSlot={<AddEntryModal type="income" month={month} />}
      totalSlot={
        <div className="flex items-baseline justify-between px-3.5 py-3 border-t border-border bg-[var(--surface-total)]">
          <span className="text-[11px] text-muted-foreground font-semibold tracking-[0.8px] uppercase">
            Total
          </span>
          <span className="font-mono text-[15px] font-bold text-accent">
            {formatCurrency(total)}
          </span>
        </div>
      }
    >
      {incomes.map((income, i) => (
        <EntryRow
          key={income.id}
          id={income.id}
          label={income.label}
          person={income.person}
          amount={formatCurrency(income.amount, { signed: true })}
          amountClassName="text-accent"
          isLast={i === incomes.length - 1}
          actions={
            <>
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
                onDelete={() => deleteIncome(income.id, month)}
              />
            </>
          }
        />
      ))}
    </SectionShell>
  )
}
