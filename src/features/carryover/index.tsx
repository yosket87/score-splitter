'use client'

import { SectionShell, EntryRow } from '@/components/entry-section'
import { AddEntryModal } from '@/features/add-entry'
import { EntryActions } from '@/features/entry-actions'
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
      title="繰越"
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
            <EntryActions
              edit={{
                id: carryover.id,
                month,
                label: carryover.label,
                amount: carryover.amount,
                person: carryover.person,
                type: 'carryover',
                isCleared: carryover.isCleared,
                onUpdate: updateCarryover,
              }}
              onDelete={() => deleteCarryover(carryover.id, month)}
              toggle={{
                active: carryover.isCleared,
                activeIcon: '✓',
                inactiveIcon: '○',
                label: carryover.isCleared ? '清算を取消' : '清算する',
                ariaLabel: carryover.isCleared ? `${carryover.label}の清算を取消` : `${carryover.label}を清算する`,
                onToggle: () => toggleCarryoverCleared(carryover.id, !carryover.isCleared, month),
              }}
            />
          }
        />
      ))}
    </SectionShell>
  )
}
