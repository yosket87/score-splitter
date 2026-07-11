'use client'

import { PERSON_LABELS } from '@/lib/constants'
import type { Person } from '@/types'

interface PersonSelectorProps {
  value: Person
  onChange: (person: Person) => void
  name?: string
  ariaLabel?: string
  ariaLabelledBy?: string
}

export function PersonSelector({
  value,
  onChange,
  name,
  ariaLabel = '担当者',
  ariaLabelledBy,
}: PersonSelectorProps) {
  return (
    <div
      className="flex gap-2"
      role="radiogroup"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {name && <input type="hidden" name={name} value={value} />}
      {(['husband', 'wife'] as const).map((p) => {
        const active = value === p
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p)}
            className={`flex-1 py-3 rounded-lg text-sm font-semibold text-center transition-colors border ${
              active
                ? p === 'husband'
                  ? 'bg-husband-light text-husband border-husband'
                  : 'bg-wife-light text-wife border-wife'
                : 'bg-card text-sub-text border-border'
            }`}
          >
            {PERSON_LABELS[p]}
          </button>
        )
      })}
    </div>
  )
}
