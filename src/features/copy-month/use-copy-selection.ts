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
  const [itemSelections, setItemSelections] = useState<Record<string, ItemSelection>>({})
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
        const selection = itemSelections[item.id]
        return selection && selection !== 'none'
      })
      .map((item) => ({
        ...item,
        itemCopyMode: (itemSelections[item.id] as ItemCopyMode) || 'withAmount',
      }))
  }, [itemSelections, preview])

  const selectedCount = Object.values(itemSelections).filter(
    (s) => s !== 'none'
  ).length
  const canCopy = selectedCount > 0 || includeCarryover
  const totalSelected =
    selectedCount + (includeCarryover && preview ? preview.carryoverCount : 0)

  const resetSelection = useCallback(() => {
    setItemSelections({})
    setIncludeCarryover(true)
  }, [])

  const initializeSelection = useCallback((items: CopyItem[]) => {
    setItemSelections(Object.fromEntries(items.map((item) => [item.id, 'withAmount'])))
  }, [])

  const setItemSelection = useCallback((id: string, selection: ItemSelection) => {
    setItemSelections((prev) => ({ ...prev, [id]: selection }))
  }, [])

  const toggleAllInType = useCallback((type: 'income' | 'expense') => {
    const items = groupedItems[type]
    const allSelected = items.every(
      (item) => itemSelections[item.id] !== 'none'
    )

    setItemSelections((prev) => {
      return {
        ...prev,
        ...Object.fromEntries(items.map((item) => [item.id, allSelected ? 'none' : 'withAmount'])),
      }
    })
  }, [groupedItems, itemSelections])

  const selectAll = useCallback(() => {
    if (!preview) return
    initializeSelection(preview.items)
    setIncludeCarryover(true)
  }, [initializeSelection, preview])

  const deselectAll = useCallback(() => {
    if (!preview) return
    setItemSelections(Object.fromEntries(preview.items.map((item) => [item.id, 'none'])))
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
