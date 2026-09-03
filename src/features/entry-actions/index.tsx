'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { Ellipsis, Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DeleteButton } from '@/components/ui/delete-button'
import { EntryToggleButton } from '@/components/entry-toggle-button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EditModal, type EditEntryProps } from '@/features/edit-entry'
import { useIsMobile } from '@/hooks/use-is-mobile'
import type { ActionResult } from '@/types'

interface EntryActionsProps {
  edit: EditEntryProps
  onDelete: () => Promise<ActionResult>
  toggle?: {
    active: boolean
    activeIcon: ReactNode
    inactiveIcon: ReactNode
    label: string
    ariaLabel: string
    onToggle: () => Promise<ActionResult>
  }
}

export function EntryActions({ edit, onDelete, toggle }: EntryActionsProps) {
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null)
  const [pending, startTransition] = useTransition()
  const menuTrigger = useRef<HTMLButtonElement>(null)

  async function handleToggle() {
    if (!toggle) return
    try {
      const result = await toggle.onToggle()
      if (result.success) {
        setMenuOpen(false)
      } else {
        toast.error(result.error ?? '更新に失敗しました')
      }
    } catch {
      toast.error('更新に失敗しました')
    }
  }

  function restoreMenuFocus(event: Event) {
    if (!isMobile) return
    event.preventDefault()
    menuTrigger.current?.focus()
  }

  return (
    <>
      {isMobile && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              ref={menuTrigger}
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={`${edit.label}のメニュー`}
              className="rounded-xl bg-muted/60 text-muted-foreground md:hidden"
            >
              <Ellipsis aria-hidden="true" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-52 rounded-xl p-1.5"
            onCloseAutoFocus={(event) => {
              if (dialog) event.preventDefault()
            }}
          >
            <DropdownMenuItem className="min-h-12 gap-3 rounded-lg px-3" disabled={pending} onSelect={() => setDialog('edit')}>
              <Pencil aria-hidden="true" />編集
            </DropdownMenuItem>
            {toggle && (
              <DropdownMenuItem
                className="min-h-12 gap-3 rounded-lg px-3"
                disabled={pending}
                aria-busy={pending}
                onSelect={(event) => {
                  event.preventDefault()
                  startTransition(handleToggle)
                }}
              >
                <span aria-hidden="true" className="flex size-4 items-center justify-center">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : toggle.active ? toggle.activeIcon : toggle.inactiveIcon}
                </span>
                {toggle.label}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="min-h-12 gap-3 rounded-lg px-3" variant="destructive" disabled={pending} onSelect={() => setDialog('delete')}>
              <Trash2 aria-hidden="true" />削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!isMobile && toggle && (
        <form action={handleToggle}>
          <EntryToggleButton
            active={toggle.active}
            activeIcon={toggle.activeIcon}
            inactiveIcon={toggle.inactiveIcon}
            ariaLabel={toggle.ariaLabel}
          />
        </form>
      )}
      {/* メニューを閉じても編集・削除のダイアログが消えないよう、外側に置く。 */}
      <EditModal
        {...edit}
        open={dialog === 'edit'}
        onOpenChange={(open) => setDialog(open ? 'edit' : null)}
        trigger={isMobile ? null : undefined}
        onCloseAutoFocus={restoreMenuFocus}
      />
      <DeleteButton
        itemName={edit.label}
        onDelete={onDelete}
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        trigger={isMobile ? null : undefined}
        onCloseAutoFocus={restoreMenuFocus}
      />
    </>
  )
}
