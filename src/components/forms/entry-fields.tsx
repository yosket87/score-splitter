'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { PersonSelector } from '@/components/ui/person-selector'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { cn } from '@/lib/utils'
import type { EntryType, Person } from '@/types'

type EntryFieldsVariant = 'regular' | 'compact'

interface EntryFieldsProps {
  type: EntryType
  person: Person
  onPersonChange: (person: Person) => void
  isCarryover: boolean
  onCarryoverChange: (checked: boolean) => void
  isCleared: boolean
  onClearedChange: (checked: boolean) => void
  error: string | null
  labelDefaultValue?: string
  amountDefaultValue?: number
  variant?: EntryFieldsVariant
}

export function EntryFields({
  type,
  person,
  onPersonChange,
  isCarryover,
  onCarryoverChange,
  isCleared,
  onClearedChange,
  error,
  labelDefaultValue,
  amountDefaultValue,
  variant = 'regular',
}: EntryFieldsProps) {
  const formId = useId()
  const compact = variant === 'compact'

  return (
    <>
      <div>
        <label
          htmlFor={`${formId}-label`}
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-sub-text mb-1.5 block"
        >
          項目名
        </label>
        <Input
          id={`${formId}-label`}
          name="label"
          defaultValue={labelDefaultValue}
          placeholder="例：食費、家賃、給与"
          className={cn(
            compact ? 'h-11 rounded-lg bg-muted' : 'h-12 rounded-xl'
          )}
          autoComplete="off"
          required
        />
      </div>

      <div>
        <label
          htmlFor={`${formId}-amount`}
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-sub-text mb-1.5 block"
        >
          金額
        </label>
        <div className={compact ? 'relative' : undefined}>
          {compact && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              ¥
            </span>
          )}
          <Input
            id={`${formId}-amount`}
            name="amount"
            type="number"
            inputMode="numeric"
            defaultValue={amountDefaultValue}
            placeholder={compact ? '0' : '¥ 0'}
            className={cn(
              'text-[28px] font-bold text-right font-tabular',
              compact
                ? 'h-11 rounded-lg border border-border pl-7'
                : 'h-14 rounded-xl'
            )}
            autoComplete="off"
            min={1}
            required
          />
        </div>
      </div>

      <div>
        <label
          id={`${formId}-person-label`}
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-sub-text mb-1.5 block"
        >
          担当者
        </label>
        <PersonSelector
          value={person}
          onChange={onPersonChange}
          ariaLabelledBy={`${formId}-person-label`}
        />
      </div>

      {type === 'expense' && (
        <ToggleSwitch
          checked={isCarryover}
          onChange={onCarryoverChange}
          label="繰越扱いにする"
          description="精算には含めず翌月へ"
        />
      )}

      {type === 'carryover' && (
        <ToggleSwitch
          checked={isCleared}
          onChange={onClearedChange}
          label="今月で清算する"
          description="精算に含める"
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  )
}
