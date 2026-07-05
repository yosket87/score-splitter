'use client'

import { useState, useRef } from 'react'
import { TYPE_LABELS } from '@/lib/constants'
import { EntryFields } from '@/components/entry-fields'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { createIncome } from '@/app/actions/income'
import { createExpense } from '@/app/actions/expense'
import { createCarryover } from '@/app/actions/carryover'
import type { EntryType, Person } from '@/types'

interface AddEntryFormProps {
  type: EntryType
  month: string
  onSuccess: () => void
  onCancel: () => void
}


const createActions = {
  income: createIncome,
  expense: createExpense,
  carryover: createCarryover,
}

export function AddEntryForm({ type, month, onSuccess, onCancel }: AddEntryFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [person, setPerson] = useState<Person>('husband')
  const [isCarryover, setIsCarryover] = useState(false)
  const [isCleared, setIsCleared] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

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

    const result = await createActions[type](formData)

    if (result.success) {
      formRef.current?.reset()
      setPerson('husband')
      setIsCarryover(false)
      setIsCleared(false)
      onSuccess()
    } else {
      setError(result.error ?? '追加に失敗しました')
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3">
      <EntryFields
        type={type}
        person={person}
        onPersonChange={setPerson}
        isCarryover={isCarryover}
        onCarryoverChange={setIsCarryover}
        isCleared={isCleared}
        onClearedChange={setIsCleared}
        error={error}
      />
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12"
          onClick={onCancel}
        >
          キャンセル
        </Button>
        <SubmitButton className="flex-1 h-12" pendingChildren="追加中...">
          {TYPE_LABELS[type]}を追加
        </SubmitButton>
      </div>
    </form>
  )
}
