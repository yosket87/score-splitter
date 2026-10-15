'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useRequestGuard } from '@/hooks/use-request-guard'
import { getCopyMonthPreview, copyMonthData } from '@/app/actions/copy-month'
import { useCopySelection } from './use-copy-selection'
import type { CopyMonthPreview, CopyMode } from '@/types'

interface CopyMonthOptions {
  currentMonth: string
  previousMonth: string
}

// 呼出し元で世帯・月ごとにkeyを分け、画面の寿命と応答guardを揃える。
export function useCopyMonth({ currentMonth, previousMonth }: CopyMonthOptions) {
  const router = useRouter()
  const captureRequest = useRequestGuard()
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [preview, setPreview] = useState<CopyMonthPreview | null>(null)
  const [mode, setMode] = useState<CopyMode>('add')
  const [showReplaceConfirmation, setShowReplaceConfirmation] = useState(false)
  const {
    itemSelections,
    includeCarryover,
    setIncludeCarryover,
    groupedItems,
    selectedItems,
    canCopy,
    totalSelected,
    resetSelection,
    initializeSelection,
    setItemSelection,
    toggleAllInType,
    selectAll,
    deselectAll,
  } = useCopySelection(preview)

  // ダイアログ開閉時のハンドラ
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      // 状態リセット
      setPreview(null)
      resetSelection()
      setShowReplaceConfirmation(false)
    }
  }

  // ダイアログを開いた時にプレビューを取得
  useEffect(() => {
    let active = true
    const isCurrent = captureRequest()
    if (open) {
      getCopyMonthPreview(previousMonth, currentMonth).then((result) => {
        if (!active || !isCurrent()) return
        if (!result.success || !result.data) {
          toast.error(result.error ?? 'プレビューの取得に失敗しました')
          return
        }
        setPreview(result.data)
        initializeSelection(result.data.items)
      }).catch(() => {
        if (active && isCurrent()) toast.error('プレビューの取得に失敗しました')
      })
    }
    return () => { active = false }
  }, [captureRequest, open, previousMonth, currentMonth, initializeSelection])

  async function handleCopy() {
    if (!preview) return

    if (selectedItems.length === 0 && !includeCarryover) {
      toast.error('コピーする項目を選択してください')
      return
    }

    if (requiresReplaceConfirmation && !showReplaceConfirmation) {
      setShowReplaceConfirmation(true)
      return
    }

    const isCurrent = captureRequest()
    setIsPending(true)

    try {
      const result = await copyMonthData({
        sourceMonth: previousMonth,
        carryoverFingerprint: preview?.carryoverFingerprint,
        targetMonth: currentMonth,
        mode,
        selectedItems,
        includeCarryover,
      })

      if (!isCurrent()) return

      if (result.success && result.data) {
        const copyResult = result.data
        const total =
          copyResult.copied.incomes +
          copyResult.copied.expenses +
          copyResult.copied.carryovers
        const skippedTotal =
          copyResult.skipped.incomes +
          copyResult.skipped.expenses +
          copyResult.skipped.carryovers
        if (skippedTotal > 0) {
          toast.success(`${total}件コピー、${skippedTotal}件スキップしました`)
        } else {
          toast.success(`${total}件のデータをコピーしました`)
        }
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'コピーに失敗しました')
      }
    } catch {
      if (isCurrent()) toast.error('コピーに失敗しました')
    } finally {
      if (isCurrent()) setIsPending(false)
    }
  }

  const hasSourceData =
    preview && (preview.items.length > 0 || preview.carryoverCount > 0)
  const hasExistingData = Boolean(preview && preview.existingCount > 0)
  const requiresReplaceConfirmation = mode === 'replace' && hasExistingData

  function handleModeChange(nextMode: CopyMode) {
    setMode(nextMode)
    setShowReplaceConfirmation(false)
  }

  return {
    open,
    isPending,
    preview,
    mode,
    showReplaceConfirmation,
    itemSelections,
    includeCarryover,
    setIncludeCarryover,
    groupedItems,
    canCopy,
    totalSelected,
    setItemSelection,
    toggleAllInType,
    selectAll,
    deselectAll,
    hasSourceData,
    hasExistingData,
    requiresReplaceConfirmation,
    handleOpenChange,
    handleCopy,
    handleModeChange,
  }
}
