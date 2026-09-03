'use client'

import { useState } from 'react'
import { AddEntrySheet } from './components/add-entry-sheet'

export { AddEntryModal } from './components/add-entry-modal'

interface AddEntryFabProps {
  month: string
}

export function AddEntryFab({ month }: AddEntryFabProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden" data-slot="entry-add-bar">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="項目を追加"
          className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-3 text-accent-foreground shadow-fab active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="text-base font-semibold">+</span>
          <span className="text-[13px] font-semibold">項目を追加</span>
        </button>
      </div>
      <AddEntrySheet open={open} onOpenChange={setOpen} month={month} />
    </>
  )
}
