'use client'

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ActionResult } from '@/types'

interface DeleteButtonProps {
  label?: string
  itemName: string
  confirmDescription?: string
  onDelete: () => Promise<ActionResult | void>
  onDeleted?: () => void
}

export function DeleteButton({
  label,
  itemName,
  confirmDescription = 'この操作は取り消せません。削除してよろしいですか？',
  onDelete,
  onDeleted,
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const accessibleLabel = label ?? `${itemName}を削除`

  async function handleDelete() {
    setPending(true)
    try {
      const result = await onDelete()
      if (isFailedActionResult(result)) {
        toast.error(result.error ?? '削除に失敗しました')
        return
      }
      setOpen(false)
      onDeleted?.()
    } catch {
      toast.error('削除に失敗しました')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={accessibleLabel}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>「{itemName}」を削除しますか？</DialogTitle>
          <DialogDescription>{confirmDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11" disabled={pending}>
              キャンセル
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                削除中…
              </>
            ) : (
              '削除する'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function isFailedActionResult(result: ActionResult | void): result is ActionResult {
  return typeof result === 'object' && result !== null && result.success === false
}
