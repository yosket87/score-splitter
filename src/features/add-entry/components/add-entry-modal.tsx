'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { TYPE_LABELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { AddEntryForm } from './add-entry-form'
import type { EntryType } from '@/types'

interface AddEntryModalProps {
  type: EntryType
  month: string
}


export function AddEntryModal({ type, month }: AddEntryModalProps) {
  const [open, setOpen] = useState(false)
  const title = `${TYPE_LABELS[type]}を追加`

  const trigger = (
    <Button variant="outline" size="sm" className="mt-2 w-full">
      <Plus className="size-3.5" />
      項目を追加
    </Button>
  )

  const form = (
    <AddEntryForm
      type={type}
      month={month}
      onSuccess={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  )

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={title}
    >
      {form}
    </ResponsiveModal>
  )
}
