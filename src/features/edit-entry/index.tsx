'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { TYPE_LABELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { EntryFields } from '@/components/forms/entry-fields'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { SubmitButton } from '@/components/ui/submit-button'
import type { Person } from '@/types'

interface EditModalProps {
  id: string
  month: string
  label: string
  amount: number
  person: Person
  type: 'income' | 'expense' | 'carryover'
  isCarryover?: boolean
  isCleared?: boolean
  onUpdate: (
    id: string,
    formData: FormData
  ) => Promise<{ success: boolean; error?: string }>
}


export function EditModal({
  id,
  month,
  label,
  amount,
  person: initialPerson,
  type,
  isCarryover: initialIsCarryover,
  isCleared: initialIsCleared,
  onUpdate,
}: EditModalProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [person, setPerson] = useState<Person>(initialPerson)
  const [isCarryover, setIsCarryover] = useState(initialIsCarryover ?? false)
  const [isCleared, setIsCleared] = useState(initialIsCleared ?? false)

  const displayAmount = type === 'income' ? amount : Math.abs(amount)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setPerson(initialPerson)
      setIsCarryover(initialIsCarryover ?? false)
      setIsCleared(initialIsCleared ?? false)
      setError(null)
    }
  }

  async function handleSubmit(formData: FormData) {
    setError(null)
    formData.set('month', month)
    formData.set('person', person)

    if (type === 'expense') {
      formData.set('is_carryover', String(isCarryover))
    }
    if (type === 'carryover') {
      formData.set('is_cleared', String(isCleared))
    }

    const result = await onUpdate(id, formData)

    if (result.success) {
      setOpen(false)
    } else {
      setError(result.error || '更新に失敗しました')
    }
  }

  const title = `${TYPE_LABELS[type]}を編集`

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${label}を編集`}
      className="h-9 w-9 text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  )

  const form = (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <EntryFields
        type={type}
        person={person}
        onPersonChange={setPerson}
        isCarryover={isCarryover}
        onCarryoverChange={setIsCarryover}
        isCleared={isCleared}
        onClearedChange={setIsCleared}
        error={error}
        labelDefaultValue={label}
        amountDefaultValue={displayAmount}
      />
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12"
          onClick={() => setOpen(false)}
        >
          キャンセル
        </Button>
        <SubmitButton className="flex-1 h-12" pendingChildren="更新中...">
          更新
        </SubmitButton>
      </div>
    </form>
  )

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title={title}
    >
      {form}
    </ResponsiveModal>
  )
}
