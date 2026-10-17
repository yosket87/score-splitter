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
import { useIsMobile } from '@/hooks/use-is-mobile'
import type { ActionResult } from '@/types'

interface EntryActionsProps {
  label: string
  onEdit: (trigger: HTMLButtonElement) => void
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

export function EntryActions({ label, onEdit, onDelete, toggle }: EntryActionsProps) {
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const openingEditor = useRef(false)
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
              aria-label={`${label}のメニュー`}
              className="rounded-xl bg-muted/60 text-muted-foreground md:hidden"
            >
              <Ellipsis aria-hidden="true" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-52 rounded-xl p-1.5"
            onCloseAutoFocus={(event) => {
              if (deleteOpen || openingEditor.current) event.preventDefault()
              openingEditor.current = false
            }}
          >
            <DropdownMenuItem className="min-h-12 gap-3 rounded-lg px-3" disabled={pending} onSelect={() => {
              if (menuTrigger.current) {
                openingEditor.current = true
                onEdit(menuTrigger.current)
              }
            }}>
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
            <DropdownMenuItem className="min-h-12 gap-3 rounded-lg px-3" variant="destructive" disabled={pending} onSelect={() => setDeleteOpen(true)}>
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
      {!isMobile && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${label}を編集`}
          aria-haspopup="dialog"
          className="text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
          onClick={(event) => onEdit(event.currentTarget)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {/* メニューを閉じても削除のダイアログが消えないよう、外側に置く。 */}
      <DeleteButton
        itemName={label}
        onDelete={onDelete}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={isMobile ? null : undefined}
        onCloseAutoFocus={restoreMenuFocus}
      />
    </>
  )
}
