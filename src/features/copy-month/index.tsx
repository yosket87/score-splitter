'use client'

import { Copy, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { formatMonth } from '@/lib/helpers/format'
import { CopyItemGroup } from './components/copy-item-group'
import { CopyModeSelect } from './components/copy-mode-select'
import { useCopyMonth } from './use-copy-month'

interface CopyMonthDialogProps {
  householdId: string
  currentMonth: string
  previousMonth: string
}

export function CopyMonthDialog(props: CopyMonthDialogProps) {
  return <ScopedCopyMonthDialog key={`${props.householdId}:${props.currentMonth}`} {...props} />
}

function ScopedCopyMonthDialog({
  currentMonth,
  previousMonth,
}: CopyMonthDialogProps) {
  const {
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
  } = useCopyMonth({ currentMonth, previousMonth })

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      aria-label="前月からコピー"
      className="h-11 w-11 gap-1 p-0 sm:h-11 sm:w-auto sm:px-3"
    >
      <Copy className="h-4 w-4" />
      <span className="hidden sm:inline">前月からコピー</span>
    </Button>
  )

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title="前月からデータをコピー"
      description="コピー元と対象を確認し、コピーする項目を選択します。"
      dialogContentClassName="flex max-h-[80vh] flex-col overflow-hidden"
      drawerContentClassName="max-h-[90vh] overflow-hidden"
      drawerBodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {!preview ? (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          <span className="text-sm">読み込み中…</span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
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
                    className="min-h-11 rounded px-2 text-xs text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    すべて選択
                  </button>
                  <span className="text-muted-foreground/30">|</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="min-h-11 rounded px-2 text-xs text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    すべて解除
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                <CopyItemGroup
                  type="income"
                  items={groupedItems.income}
                  selections={itemSelections}
                  onSelectionChange={setItemSelection}
                  onToggleAll={toggleAllInType}
                />
                <CopyItemGroup
                  type="expense"
                  items={groupedItems.expense}
                  selections={itemSelections}
                  onSelectionChange={setItemSelection}
                  onToggleAll={toggleAllInType}
                />

                {/* 繰越（一括選択のみ） */}
                {preview.carryoverCount > 0 && (
                  <div>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2">
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
                <CopyModeSelect mode={mode} onModeChange={handleModeChange} />
              )}

              {requiresReplaceConfirmation &&
                showReplaceConfirmation &&
                preview && (
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

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => handleOpenChange(false)}
        >
          キャンセル
        </Button>
        <Button
          className="min-h-11"
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
    </ResponsiveModal>
  )
}
