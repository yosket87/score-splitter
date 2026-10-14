'use client'

import { SectionShell, EntryRow } from '@/components/entry-section'
import { AddEntryModal } from '@/features/add-entry'
import { EntryActions } from '@/features/entry-actions'
import { EditModal } from '@/features/edit-entry'
import { useEntryEditor } from '@/features/edit-entry/use-entry-editor'
import { updateIncome, deleteIncome } from '@/app/actions/income'
import { formatCurrency } from '@/lib/helpers/format'
import type { Income } from '@/types'

interface IncomeSectionProps {
  incomes: Income[]
  month: string
}

export function IncomeSection({ incomes, month }: IncomeSectionProps) {
  const editor = useEntryEditor(incomes)
  const total = incomes.reduce((sum, i) => sum + i.amount, 0)

  return (
    <>
      <SectionShell
        dataSection="income"
        title="収入"
        meta={`${incomes.length}件`}
        isEmpty={incomes.length === 0}
        emptyLabel="収入がありません"
        addSlot={<AddEntryModal type="income" month={month} />}
        totalSlot={
          <div className="flex items-baseline justify-between px-3.5 py-3 border-t border-border bg-[var(--surface-total)]">
            <span className="text-[11px] text-muted-foreground font-semibold tracking-[0.8px] uppercase">
              合計
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
              <EntryActions
                label={income.label}
                onEdit={(trigger) => editor.openEditor(income.id, trigger)}
                onDelete={() => deleteIncome(income.id, month)}
              />
            }
          />
        ))}
      </SectionShell>
      {editor.entry && (
        <EditModal
          key={editor.entry.id}
          {...editor.entry}
          {...editor.modalProps}
          month={month}
          type="income"
          onUpdate={updateIncome}
        />
      )}
    </>
  )
}
