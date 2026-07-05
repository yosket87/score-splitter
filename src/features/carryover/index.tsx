'use client'

import { toast } from 'sonner'
import { SectionShell, EntryRow } from '@/components/entry-section'
import { EntryToggleButton } from '@/components/entry-toggle-button'
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
                <EntryToggleButton
                  active={carryover.isCleared}
                  activeIcon="✓"
                  inactiveIcon="○"
                  ariaLabel={
                    carryover.isCleared
                      ? `${carryover.label}の清算を取消`
                      : `${carryover.label}を清算する`
                  }
                />
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
