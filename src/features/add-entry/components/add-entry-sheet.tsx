'use client'

import { useState, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer'
import { EntryFields } from '@/components/entry-fields'
import { TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { createIncome } from '@/app/actions/income'
import { createExpense } from '@/app/actions/expense'
import { createCarryover } from '@/app/actions/carryover'
import type { EntryType, Person } from '@/types'

interface AddEntrySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
}

const createActions = {
  income: createIncome,
  expense: createExpense,
  carryover: createCarryover,
}

interface SheetSubmitButtonProps {
  children: ReactNode
  pendingChildren?: ReactNode
  className?: string
}

function SheetSubmitButton({
  children,
  pendingChildren,
  className,
}: SheetSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn('disabled:opacity-50', className)}
    >
      {pending ? pendingChildren ?? children : children}
    </button>
  )
}

export function AddEntrySheet({ open, onOpenChange, month }: AddEntrySheetProps) {
  const [entryType, setEntryType] = useState<EntryType>('expense')
  const [person, setPerson] = useState<Person>('husband')
  const [isCarryover, setIsCarryover] = useState(false)
  const [isCleared, setIsCleared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function resetFormState() {
    formRef.current?.reset()
    setEntryType('expense')
    setPerson('husband')
    setIsCarryover(false)
    setIsCleared(false)
  }

  async function handleSubmit(formData: FormData) {
    setError(null)

    formData.set('month', month)
    formData.set('person', person)

    try {
      if (entryType === 'expense') {
        formData.set('is_carryover', String(isCarryover))
      }
      if (entryType === 'carryover') {
        formData.set('is_cleared', String(isCleared))
      }

      const result = await createActions[entryType](formData)

      if (result && !result.success) {
        setError(result.error ?? '追加に失敗しました')
        return
      }

      resetFormState()
      onOpenChange(false)
    } catch {
      setError('追加に失敗しました')
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[22px] pb-safe">
        <form
          id="add-entry-form"
          ref={formRef}
          action={handleSubmit}
          className="flex flex-col"
        >
          <DrawerHeader className="flex flex-row items-center justify-between px-4 py-2">
            <DrawerClose className="min-h-11 px-2 text-sm font-semibold text-sub-text">
              キャンセル
            </DrawerClose>
            <DrawerTitle className="text-base font-bold">
              項目を追加
            </DrawerTitle>
            <SheetSubmitButton className="min-h-11 px-2 text-sm font-bold text-accent">
              保存
            </SheetSubmitButton>
          </DrawerHeader>

          <div
            className="flex h-11 gap-1 mx-4 mb-3 bg-muted rounded-[12px] p-[3px]"
            role="radiogroup"
            aria-label="項目種別"
          >
            {(['income', 'expense', 'carryover'] as const).map((t) => {
              const active = entryType === t
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setEntryType(t)
                    setIsCarryover(false)
                    setIsCleared(false)
                  }}
                  className={cn(
                    'flex-1 rounded-lg text-[13px] text-center transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground font-semibold'
                      : 'text-muted-foreground'
                  )}
                >
                  {TYPE_LABELS[t]}
                </button>
              )
            })}
          </div>

          <div className="flex flex-col gap-3 px-4 pb-4">
            <EntryFields
              type={entryType}
              person={person}
              onPersonChange={setPerson}
              isCarryover={isCarryover}
              onCarryoverChange={setIsCarryover}
              isCleared={isCleared}
              onClearedChange={setIsCleared}
              error={error}
              variant="compact"
            />
          </div>

          <div className="px-4 pb-4">
            <SheetSubmitButton
              pendingChildren="追加中..."
              className="w-full h-12 bg-accent text-accent-foreground rounded-[12px] text-[15px] font-bold text-center shadow-fab transition-opacity"
            >
              {TYPE_LABELS[entryType]}を追加
            </SheetSubmitButton>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
