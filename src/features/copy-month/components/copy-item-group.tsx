'use client'

import { useEffect, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PERSON_LABELS } from '@/lib/constants'
import { formatCurrency } from '@/lib/helpers/format'
import type { CopyItem } from '@/types'
import type { ItemSelection } from '../types'

interface CopyItemGroupProps {
  type: 'income' | 'expense'
  items: CopyItem[]
  selections: Record<string, ItemSelection>
  onSelectionChange: (id: string, selection: ItemSelection) => void
  onToggleAll: (type: 'income' | 'expense') => void
}

export function CopyItemGroup({
  type,
  items,
  selections,
  onSelectionChange,
  onToggleAll,
}: CopyItemGroupProps) {
  const groupCheckboxRef = useRef<HTMLInputElement>(null)
  const typeLabel = type === 'income' ? '収入' : '支出'
  const selectedInGroup = items.filter(
    (item) => selections[item.id] !== 'none'
  ).length
  const allSelected = selectedInGroup === items.length
  const someSelected = selectedInGroup > 0 && selectedInGroup < items.length

  useEffect(() => {
    if (groupCheckboxRef.current) {
      groupCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  if (items.length === 0) return null

  return (
    <div key={type} className="space-y-2">
      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={allSelected}
          ref={groupCheckboxRef}
          onChange={() => onToggleAll(type)}
          className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <span className="font-medium">{typeLabel}</span>
        <span className="text-sm text-muted-foreground">({items.length}件)</span>
      </label>
      <div className="ml-6 space-y-1">
        {items.map((item) => {
          const selection = selections[item.id] || 'none'
          const isSelected = selection !== 'none'

          return (
            <div
              key={item.id}
              className="flex min-h-11 items-center gap-2 rounded px-2 hover:bg-muted/50"
            >
              <label className="-ml-3 grid size-11 shrink-0 cursor-pointer place-items-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() =>
                    onSelectionChange(
                      item.id,
                      isSelected ? 'none' : 'withAmount'
                    )
                  }
                  aria-label={`${item.label}を選択`}
                  className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </label>
              <span className="flex-1 text-sm">{item.label}</span>
              <span className="text-xs text-muted-foreground">
                {PERSON_LABELS[item.person]}
              </span>
              <span className="text-sm font-tabular w-20 text-right">
                {formatCurrency(item.amount)}
              </span>
              {isSelected && (
                <Select
                  value={selection}
                  onValueChange={(value) => {
                    if (value === 'withAmount' || value === 'labelOnly') {
                      onSelectionChange(item.id, value)
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label={`${item.label}のコピーモード`}
                    className="min-h-11 shrink-0 gap-1 px-2 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="withAmount">金額込み</SelectItem>
                    <SelectItem value="labelOnly">項目名のみ</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
