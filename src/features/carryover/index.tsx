'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SectionShell, EntryRow } from '@/components/sections/entry-section'
import { DeleteButton } from '@/components/ui/delete-button'
import { AddEntryModal } from '@/features/add-entry'
import { EditModal } from '@/features/edit-entry'
import { updateCarryover, deleteCarryover, toggleCarryoverCleared } from '@/app/actions/carryover'
import { formatCurrency } from '@/lib/utils/format'
import type { Carryover } from '@/types'

interface CarryoverSectionProps {
  carryovers: Carryover[]
  month: string
}

function ClearedToggleButton({ carryover }: { carryover: Carryover }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`-m-2 flex h-11 w-11 items-center justify-center rounded-full text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed ${
        carryover.isCleared
          ? 'text-accent bg-accent/10'
          : 'text-muted-foreground hover:text-accent hover:bg-accent/10'
      }`}
      aria-label={carryover.isCleared ? `${carryover.label}の清算を取消` : `${carryover.label}を清算する`}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        carryover.isCleared ? '✓' : '○'
      )}
    </button>
  )
}

export function CarryoverSection({ carryovers, month }: CarryoverSectionProps) {
  const clearedCarryovers = carryovers.filter((c) => c.isCleared)
  const total = carryovers.reduce((sum, c) => sum + Math.abs(c.amount), 0)

  return (
    <SectionShell
      as="section"
      dataSection="carryover"
      title="Carryover / 繰越"
      titleTestId="carryover-title"
      meta={`合計 ${formatCurrency(total)}${clearedCarryovers.length > 0 ? ` / 清算済み ${clearedCarryovers.length}件` : ''}`}
      isEmpty={carryovers.length === 0}
      emptyLabel="繰越がありません"
      addSlot={<AddEntryModal type="carryover" month={month} />}
    >
      {carryovers.map((carryover, i) => (
        <EntryRow
          key={carryover.id}
          id={carryover.id}
          label={carryover.label}
          person={carryover.person}
          amount={formatCurrency(carryover.amount, { absolute: true })}
          amountClassName={
            carryover.isCleared
              ? 'text-foreground line-through'
              : 'text-foreground'
          }
          labelClassName={carryover.isCleared ? 'line-through opacity-60' : undefined}
          labelBadge={
            carryover.isCleared ? (
              <span className="ml-1.5 text-[8px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold no-underline inline-block">
                清算済
              </span>
            ) : undefined
          }
          opacity={carryover.isCleared ? 0.6 : 1}
          isLast={i === carryovers.length - 1}
          actions={
            <>
              <form action={async () => {
                const result = await toggleCarryoverCleared(
                  carryover.id,
                  !carryover.isCleared,
                  month
                )
                if (!result.success) {
                  toast.error(result.error ?? '清算フラグの更新に失敗しました')
                }
              }}>
                <ClearedToggleButton carryover={carryover} />
              </form>
              <EditModal
                id={carryover.id}
                month={month}
                label={carryover.label}
                amount={carryover.amount}
                person={carryover.person}
                type="carryover"
                isCleared={carryover.isCleared}
                onUpdate={updateCarryover}
              />
              <DeleteButton
                itemName={carryover.label}
                label={`${carryover.label}を削除`}
                onDelete={() => deleteCarryover(carryover.id, month)}
              />
            </>
          }
        />
      ))}
    </SectionShell>
  )
}
