'use client'

import { useState, useEffect, useMemo } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LottiePlayer } from '@/components/animations/lottie-player'
import { getCopyMonthPreview, copyMonthData } from '@/app/actions/copy-month'
import { formatMonth, formatCurrency } from '@/lib/utils/format'
import type {
  CopyMonthPreview,
  CopyMode,
  CopyItem,
  ItemCopyMode,
  SelectedCopyItem,
} from '@/types'

interface CopyMonthDialogProps {
  currentMonth: string
  previousMonth: string
}

const personLabels = {
  husband: '夫',
  wife: '妻',
}

// 項目の選択状態（未選択 | 金額込み | 項目名のみ）
type ItemSelection = 'none' | 'withAmount' | 'labelOnly'

export function CopyMonthDialog({
  currentMonth,
  previousMonth,
}: CopyMonthDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [preview, setPreview] = useState<CopyMonthPreview | null>(null)
  const [mode, setMode] = useState<CopyMode>('add')
  const [showReplaceConfirmation, setShowReplaceConfirmation] = useState(false)
  // 各項目の選択状態を管理（id -> selection）
  const [itemSelections, setItemSelections] = useState<Map<string, ItemSelection>>(
    new Map()
  )
  const [includeCarryover, setIncludeCarryover] = useState(true)

  // ダイアログ開閉時のハンドラ
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      // 状態リセット
      setPreview(null)
      setItemSelections(new Map())
      setIncludeCarryover(true)
      setShowReplaceConfirmation(false)
    }
  }

  // ダイアログを開いた時にプレビューを取得
  useEffect(() => {
    if (open) {
      getCopyMonthPreview(previousMonth, currentMonth).then((result) => {
        if (!result.success || !result.data) {
          toast.error(result.error ?? 'プレビューの取得に失敗しました')
          return
        }
        setPreview(result.data)
        // デフォルトで全項目を「金額込み」で選択
        const selections = new Map<string, ItemSelection>()
        result.data.items.forEach((item) => {
          selections.set(item.id, 'withAmount')
        })
        setItemSelections(selections)
      })
    }
  }, [open, previousMonth, currentMonth])

  // 項目をタイプ別にグループ化
  const groupedItems = useMemo(() => {
    if (!preview) return { income: [], expense: [] }
    return {
      income: preview.items.filter((i) => i.type === 'income'),
      expense: preview.items.filter((i) => i.type === 'expense'),
    }
  }, [preview])

  function setItemSelection(id: string, selection: ItemSelection) {
    setItemSelections((prev) => {
      const next = new Map(prev)
      next.set(id, selection)
      return next
    })
  }

  function toggleAllInType(type: 'income' | 'expense') {
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
  }

  function selectAll() {
    if (!preview) return
    const selections = new Map<string, ItemSelection>()
    preview.items.forEach((item) => {
      selections.set(item.id, 'withAmount')
    })
    setItemSelections(selections)
    setIncludeCarryover(true)
  }

  function deselectAll() {
    if (!preview) return
    const selections = new Map<string, ItemSelection>()
    preview.items.forEach((item) => {
      selections.set(item.id, 'none')
    })
    setItemSelections(selections)
    setIncludeCarryover(false)
  }

  async function handleCopy() {
    if (!preview) return

    // 選択された項目をSelectedCopyItemに変換
    const selectedItems: SelectedCopyItem[] = preview.items
      .filter((item) => {
        const selection = itemSelections.get(item.id)
        return selection && selection !== 'none'
      })
      .map((item) => ({
        ...item,
        itemCopyMode: (itemSelections.get(item.id) as ItemCopyMode) || 'withAmount',
      }))

    if (selectedItems.length === 0 && !includeCarryover) {
      toast.error('コピーする項目を選択してください')
      return
    }

    if (requiresReplaceConfirmation && !showReplaceConfirmation) {
      setShowReplaceConfirmation(true)
      return
    }

    setIsPending(true)

    const result = await copyMonthData({
      sourceMonth: previousMonth,
      targetMonth: currentMonth,
      mode,
      selectedItems,
      includeCarryover,
    })

    setIsPending(false)

    if (result.success) {
      const total =
        result.copied.incomes +
        result.copied.expenses +
        result.copied.carryovers
      const skippedTotal =
        result.skipped.incomes +
        result.skipped.expenses +
        result.skipped.carryovers
      if (skippedTotal > 0) {
        toast.success(`${total}件コピー、${skippedTotal}件スキップしました`)
      } else {
        toast.success(`${total}件のデータをコピーしました`)
      }
      setOpen(false)
    } else {
      toast.error(result.error ?? 'コピーに失敗しました')
    }
  }

  const hasSourceData =
    preview && (preview.items.length > 0 || preview.carryoverCount > 0)
  const hasExistingData = Boolean(preview && preview.existingCount > 0)
  const requiresReplaceConfirmation = mode === 'replace' && hasExistingData

  // 選択されている項目数を計算
  const selectedCount = Array.from(itemSelections.values()).filter(
    (s) => s !== 'none'
  ).length
  const canCopy = selectedCount > 0 || includeCarryover
  const totalSelected =
    selectedCount + (includeCarryover && preview ? preview.carryoverCount : 0)

  function renderItemGroup(type: 'income' | 'expense', items: CopyItem[]) {
    if (items.length === 0) return null

    const typeLabel = type === 'income' ? '収入' : '支出'
    const selectedInGroup = items.filter(
      (item) => itemSelections.get(item.id) !== 'none'
    ).length
    const allSelected = selectedInGroup === items.length
    const someSelected = selectedInGroup > 0 && selectedInGroup < items.length

    return (
      <div key={type} className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected
            }}
            onChange={() => toggleAllInType(type)}
            className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <span className="font-medium">{typeLabel}</span>
          <span className="text-sm text-muted-foreground">({items.length}件)</span>
        </label>
        <div className="ml-6 space-y-1">
          {items.map((item) => {
            const selection = itemSelections.get(item.id) || 'none'
            const isSelected = selection !== 'none'

            return (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() =>
                    setItemSelection(
                      item.id,
                      isSelected ? 'none' : 'withAmount'
                    )
                  }
                  aria-label={`${item.label}を選択`}
                  className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <span className="flex-1 text-sm">{item.label}</span>
                <span className="text-xs text-muted-foreground">
                  {personLabels[item.person]}
                </span>
                <span className="text-sm font-tabular w-20 text-right">
                  {formatCurrency(item.amount)}
                </span>
                {isSelected && (
                  <select
                    value={selection}
                    onChange={(e) =>
                      setItemSelection(item.id, e.target.value as ItemSelection)
                    }
                    aria-label={`${item.label}のコピーモード`}
                    className="text-xs border border-input rounded px-2 py-1 bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="前月からコピー"
          className="h-11 w-11 gap-1 p-0 sm:h-8 sm:w-auto sm:px-3"
        >
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">前月からコピー</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>前月からデータをコピー</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
            <LottiePlayer
              src="/lottie/loader-dots.json"
              className="w-20 h-8"
              ariaLabel="読み込み中"
            />
            <span className="text-sm">読み込み中…</span>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* 月情報 */}
            <div className="text-sm text-muted-foreground">
              {formatMonth(previousMonth)} → {formatMonth(currentMonth)}
              {hasExistingData && (
                <span className="ml-2 text-warning">
                  （コピー先に{preview.existingCount}件の既存データあり）
                </span>
              )}
            </div>

            {/* コピー対象選択 */}
            {hasSourceData ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="font-medium">コピー対象を選択</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-xs text-accent hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
                    >
                      すべて選択
                    </button>
                    <span className="text-muted-foreground/30">|</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-xs text-accent hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
                    >
                      すべて解除
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {renderItemGroup('income', groupedItems.income)}
                  {renderItemGroup('expense', groupedItems.expense)}

                  {/* 繰越（一括選択のみ） */}
                  {preview.carryoverCount > 0 && (
                    <div>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={includeCarryover}
                          onChange={(e) => setIncludeCarryover(e.target.checked)}
                          className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring/50"
                        />
                        <span className="font-medium">繰越</span>
                        <span className="text-sm text-muted-foreground">
                          ({preview.carryoverCount}件)
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* 重複時の処理 */}
                {hasExistingData && (
                  <div>
                    <p className="mb-2 font-medium">既存データの処理</p>
                    <Select
                      value={mode}
                      onValueChange={(v) => {
                        setMode(v as CopyMode)
                        setShowReplaceConfirmation(false)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">
                          追加（既存データを残す）
                        </SelectItem>
                        <SelectItem value="skip">
                          スキップ（同じ項目があればスキップ）
                        </SelectItem>
                        <SelectItem value="replace">
                          置換（既存データを削除してコピー）
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {requiresReplaceConfirmation && showReplaceConfirmation && preview && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    既存の{preview.existingCount}件を削除してコピーします。続行するには確認してください。
                  </div>
                )}
              </>
            ) : (
              <p className="py-4 text-center text-muted-foreground">
                コピー元の月にデータがありません
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button
            onClick={handleCopy}
            disabled={isPending || !hasSourceData || !canCopy}
          >
            {isPending
              ? 'コピー中…'
              : requiresReplaceConfirmation && showReplaceConfirmation
                ? '既存データを削除してコピー'
                : `コピーする (${totalSelected}件)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
