'use client'

import { useId, useState, useRef } from 'react'
import { TYPE_LABELS } from '@/lib/constants'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { PersonSelector } from '@/components/ui/person-selector'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { createIncome } from '@/app/actions/income'
import { createExpense } from '@/app/actions/expense'
import { createCarryover } from '@/app/actions/carryover'
import type { Person } from '@/types'

interface AddEntryFormProps {
  type: 'income' | 'expense' | 'carryover'
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
  const formId = useId()
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
      <div>
        <label
          htmlFor={`${formId}-label`}
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-sub-text mb-1.5 block"
        >
          項目名
        </label>
        <Input
          id={`${formId}-label`}
          name="label"
          placeholder="例：食費、家賃、給与"
          className="h-12 rounded-xl"
          autoComplete="off"
          required
        />
      </div>
      <div>
        <label
          htmlFor={`${formId}-amount`}
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-sub-text mb-1.5 block"
        >
          金額
        </label>
        <Input
          id={`${formId}-amount`}
          name="amount"
          type="number"
          inputMode="numeric"
          placeholder="¥ 0"
          className="h-14 rounded-xl text-[28px] font-bold text-right font-tabular tracking-[-0.02em]"
          autoComplete="off"
          min={1}
          required
        />
      </div>
      <div>
        <label
          id={`${formId}-person-label`}
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-sub-text mb-1.5 block"
        >
          担当者
        </label>
        <PersonSelector
          value={person}
          onChange={setPerson}
          ariaLabelledBy={`${formId}-person-label`}
        />
      </div>
      {type === 'expense' && (
        <ToggleSwitch
          checked={isCarryover}
          onChange={setIsCarryover}
          label="繰越扱いにする"
          description="精算には含めず翌月へ"
        />
      )}
      {type === 'carryover' && (
        <ToggleSwitch
          checked={isCleared}
          onChange={setIsCleared}
          label="今月で清算する"
          description="精算に含める"
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
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
