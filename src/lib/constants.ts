import type { EntryType, Person } from '@/types'

export const TYPE_LABELS = {
  income: '収入',
  expense: '支出',
  carryover: '繰越',
} as const satisfies Record<EntryType, string>

export const PERSON_LABELS = {
  husband: '夫',
  wife: '妻',
} as const satisfies Record<Person, string>
