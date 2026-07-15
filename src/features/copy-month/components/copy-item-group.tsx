'use client'

import { PERSON_LABELS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils/format'
import type { CopyItem } from '@/types'
import type { ItemSelection } from '../types'

interface CopyItemGroupProps {
  type: 'income' | 'expense'
  items: CopyItem[]
  selections: Map<string, ItemSelection>
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
  if (items.length === 0) return null

  const typeLabel = type === 'income' ? '収入' : '支出'
  const selectedInGroup = items.filter(
    (item) => selections.get(item.id) !== 'none'
  ).length
  const allSelected = selectedInGroup === items.length
  const someSelected = selectedInGroup > 0 && selectedInGroup < items.length

  return (
    <div key={type} className="space-y-2">
      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected
          }}
          onChange={() => onToggleAll(type)}
          className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <span className="font-medium">{typeLabel}</span>
        <span className="text-sm text-muted-foreground">({items.length}件)</span>
      </label>
      <div className="ml-6 space-y-1">
        {items.map((item) => {
          const selection = selections.get(item.id) || 'none'
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
                <select
                  value={selection}
                  onChange={(e) =>
                    onSelectionChange(item.id, e.target.value as ItemSelection)
                  }
                  aria-label={`${item.label}のコピーモード`}
                  className="min-h-11 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <option value="withAmount">金額込み</option>
                  <option value="labelOnly">項目名のみ</option>
                </select>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
