'use client'

import { useCallback, useMemo, useState } from 'react'
import type {
  CopyItem,
  CopyMonthPreview,
  ItemCopyMode,
  SelectedCopyItem,
} from '@/types'
import type { ItemSelection } from './types'

export function useCopySelection(preview: CopyMonthPreview | null) {
  const [itemSelections, setItemSelections] = useState<Map<string, ItemSelection>>(
    new Map()
  )
  const [includeCarryover, setIncludeCarryover] = useState(true)

  const groupedItems = useMemo(() => {
    if (!preview) return { income: [], expense: [] }
    return {
      income: preview.items.filter((i) => i.type === 'income'),
      expense: preview.items.filter((i) => i.type === 'expense'),
    }
  }, [preview])

  const selectedItems = useMemo<SelectedCopyItem[]>(() => {
    if (!preview) return []
    return preview.items
      .filter((item) => {
        const selection = itemSelections.get(item.id)
        return selection && selection !== 'none'
      })
      .map((item) => ({
        ...item,
        itemCopyMode: (itemSelections.get(item.id) as ItemCopyMode) || 'withAmount',
      }))
  }, [itemSelections, preview])

  const selectedCount = Array.from(itemSelections.values()).filter(
    (s) => s !== 'none'
  ).length
  const canCopy = selectedCount > 0 || includeCarryover
  const totalSelected =
    selectedCount + (includeCarryover && preview ? preview.carryoverCount : 0)

  const resetSelection = useCallback(() => {
    setItemSelections(new Map())
    setIncludeCarryover(true)
  }, [])

  const initializeSelection = useCallback((items: CopyItem[]) => {
    const selections = new Map<string, ItemSelection>()
    items.forEach((item) => {
      selections.set(item.id, 'withAmount')
    })
    setItemSelections(selections)
  }, [])

  const setItemSelection = useCallback((id: string, selection: ItemSelection) => {
    setItemSelections((prev) => {
      const next = new Map(prev)
      next.set(id, selection)
      return next
    })
  }, [])

  const toggleAllInType = useCallback((type: 'income' | 'expense') => {
    const items = groupedItems[type]
    const allSelected = items.every(
      (item) => itemSelections.get(item.id) !== 'none'
    )

    setItemSelections((prev) => {
      const next = new Map(prev)
      items.forEach((item) => {
        next.set(item.id, allSelected ? 'none' : 'withAmount')
      })
      return next
    })
  }, [groupedItems, itemSelections])

  const selectAll = useCallback(() => {
    if (!preview) return
    initializeSelection(preview.items)
    setIncludeCarryover(true)
  }, [initializeSelection, preview])

  const deselectAll = useCallback(() => {
    if (!preview) return
    const selections = new Map<string, ItemSelection>()
    preview.items.forEach((item) => {
      selections.set(item.id, 'none')
    })
    setItemSelections(selections)
    setIncludeCarryover(false)
  }, [preview])

  return {
    itemSelections,
    includeCarryover,
    setIncludeCarryover,
    groupedItems,
    selectedItems,
    selectedCount,
    canCopy,
    totalSelected,
    resetSelection,
    initializeSelection,
    setItemSelection,
    toggleAllInType,
    selectAll,
    deselectAll,
  }
}
