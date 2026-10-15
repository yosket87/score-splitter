import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCopySelection } from '@/features/copy-month/use-copy-selection'
import type { CopyMonthPreview } from '@/types'

const preview: CopyMonthPreview = {
  sourceMonth: '202602',
  targetMonth: '202603',
  existingCount: 0,
  carryoverFingerprint: 'dummy-fingerprint',
  carryoverCount: 2,
  items: [
    { id: 'income-1', label: '給与', amount: 100, person: 'husband', type: 'income' },
    { id: 'income-2', label: '手当', amount: 20, person: 'wife', type: 'income' },
    { id: 'expense-1', label: '食費', amount: -30, person: 'wife', type: 'expense' },
  ],
}

describe('useCopySelection', () => {
  it('選択状態を通常のオブジェクトとして保持し、変更前の状態を維持する', () => {
    const { result } = renderHook(() => useCopySelection(preview))
    act(() => result.current.initializeSelection(preview.items))
    const previousSelections = result.current.itemSelections
    expect(previousSelections).toEqual({
      'income-1': 'withAmount', 'income-2': 'withAmount', 'expense-1': 'withAmount',
    })

    act(() => result.current.setItemSelection('income-1', 'labelOnly'))
    act(() => result.current.setItemSelection('expense-1', 'none'))
    expect(result.current.selectedItems).toEqual([
      { ...preview.items[0], itemCopyMode: 'labelOnly' },
      { ...preview.items[1], itemCopyMode: 'withAmount' },
    ])
    expect(result.current.selectedCount).toBe(2)
    expect(result.current.totalSelected).toBe(4)
    expect(previousSelections).toEqual({
      'income-1': 'withAmount', 'income-2': 'withAmount', 'expense-1': 'withAmount',
    })
  })

  it('種類別の全選択を切り替えても他の種類のモードを維持する', () => {
    const { result } = renderHook(() => useCopySelection(preview))
    act(() => result.current.initializeSelection(preview.items))
    act(() => result.current.setItemSelection('expense-1', 'labelOnly'))
    act(() => result.current.toggleAllInType('income'))
    expect(result.current.selectedItems).toEqual([
      { ...preview.items[2], itemCopyMode: 'labelOnly' },
    ])
    act(() => result.current.toggleAllInType('income'))
    expect(result.current.selectedItems.map((item) => item.itemCopyMode)).toEqual([
      'withAmount', 'withAmount', 'labelOnly',
    ])
  })

  it('全解除・全選択・初期化で項目と繰越の件数を更新する', () => {
    const { result } = renderHook(() => useCopySelection(preview))
    act(() => result.current.initializeSelection(preview.items))
    act(() => result.current.deselectAll())
    expect(result.current.canCopy).toBe(false)
    expect(result.current.totalSelected).toBe(0)
    act(() => result.current.selectAll())
    expect(result.current.totalSelected).toBe(5)
    expect(result.current.canCopy).toBe(true)
    act(() => result.current.resetSelection())
    expect(result.current.itemSelections).toEqual({})
    expect(result.current.selectedItems).toEqual([])
    expect(result.current.includeCarryover).toBe(true)
  })
})
