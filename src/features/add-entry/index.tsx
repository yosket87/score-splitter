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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="項目を追加"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-40 md:hidden rounded-full bg-gradient-to-r from-sky-700 to-orange-600 px-5 py-3.5 text-white shadow-fab flex items-center gap-1.5 active:scale-95 transition-transform dark:from-sky-300 dark:to-orange-300 dark:text-slate-950"
      >
        <span className="text-base font-semibold">+</span>
        <span className="text-[13px] font-semibold">項目を追加</span>
      </button>
      <AddEntrySheet open={open} onOpenChange={setOpen} month={month} />
    </>
  )
}
