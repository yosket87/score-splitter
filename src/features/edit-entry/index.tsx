'use client'

import { useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { TYPE_LABELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { EntryFields } from '@/components/entry-fields'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { SubmitButton } from '@/components/ui/submit-button'
import type { ActionResult, EntryType, Person } from '@/types'

export interface EditEntryProps {
  id: string
  month: string
  label: string
  amount: number
  person: Person
  type: EntryType
  isCarryover?: boolean
  isCleared?: boolean
  onUpdate: (id: string, formData: FormData) => Promise<ActionResult>
}

interface EditModalProps extends EditEntryProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  onCloseAutoFocus?: (event: Event) => void
}

export function EditModal({
  open: controlledOpen,
  onOpenChange,
  trigger,
  onCloseAutoFocus,
  ...entry
}: EditModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen

  function setOpen(nextOpen: boolean) {
    setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${entry.label}を編集`}
      className="text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  )

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger === undefined ? defaultTrigger : trigger}
      onCloseAutoFocus={onCloseAutoFocus}
      title={`${TYPE_LABELS[entry.type]}を編集`}
      description={`${TYPE_LABELS[entry.type]}の内容と担当者を編集します。`}
    >
      {/* 開くたびに最新の保存値でフォームを初期化する。 */}
      {open && <EditEntryForm {...entry} onClose={() => setOpen(false)} />}
    </ResponsiveModal>
  )
}

function EditEntryForm({
  id,
  month,
  label,
  amount,
  person: initialPerson,
  type,
  isCarryover: initialIsCarryover,
  isCleared: initialIsCleared,
  onUpdate,
  onClose,
}: EditEntryProps & { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [person, setPerson] = useState<Person>(initialPerson)
  const [isCarryover, setIsCarryover] = useState(initialIsCarryover ?? false)
  const [isCleared, setIsCleared] = useState(initialIsCleared ?? false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    formData.set('month', month)
    formData.set('person', person)
    if (type === 'expense') formData.set('is_carryover', String(isCarryover))
    if (type === 'carryover') formData.set('is_cleared', String(isCleared))

    try {
      const result = await onUpdate(id, formData)
      if (result.success) {
        onClose()
      } else {
        setError(result.error || '更新に失敗しました')
      }
    } catch {
      setError('更新に失敗しました')
    }
  }

  return (
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
        amountDefaultValue={type === 'income' ? amount : Math.abs(amount)}
      />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1 h-12" onClick={onClose}>
          キャンセル
        </Button>
        <SubmitButton className="flex-1 h-12" pendingChildren="更新中...">
          更新
        </SubmitButton>
      </div>
    </form>
  )
}
