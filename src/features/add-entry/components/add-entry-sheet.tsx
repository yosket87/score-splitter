'use client'

import { useId, useState, useRef } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { PersonSelector } from '@/components/ui/person-selector'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { createIncome } from '@/app/actions/income'
import { createExpense } from '@/app/actions/expense'
import { createCarryover } from '@/app/actions/carryover'

type EntryType = 'income' | 'expense' | 'carryover'
type Person = 'husband' | 'wife'

interface AddEntrySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
}

const typeConfig = {
  income: {
    label: '収入',
  },
  expense: {
    label: '支出',
  },
  carryover: {
    label: '繰越',
  },
} as const

export function AddEntrySheet({ open, onOpenChange, month }: AddEntrySheetProps) {
  const formId = useId()
  const [entryType, setEntryType] = useState<EntryType>('expense')
  const [person, setPerson] = useState<Person>('husband')
  const [isCarryover, setIsCarryover] = useState(false)
  const [isCleared, setIsCleared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSubmitting(true)

    formData.set('month', month)
    formData.set('person', person)

    try {
      let result
      if (entryType === 'income') {
        result = await createIncome(formData)
      } else if (entryType === 'expense') {
        formData.set('is_carryover', String(isCarryover))
        result = await createExpense(formData)
      } else {
        formData.set('is_cleared', String(isCleared))
        result = await createCarryover(formData)
      }

      if (result && !result.success) {
        setError(result.error ?? '追加に失敗しました')
        return
      }

      formRef.current?.reset()
      setIsCarryover(false)
      setIsCleared(false)
      onOpenChange(false)
    } catch {
      setError('追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[22px] pb-safe">
        <DrawerHeader className="flex flex-row items-center justify-between px-4 py-2">
          <DrawerClose className="min-h-11 px-2 text-sm font-semibold text-sub-text">
            キャンセル
          </DrawerClose>
          <DrawerTitle className="text-base font-bold">
            項目を追加
          </DrawerTitle>
          <button
            type="submit"
            form="add-entry-form"
            disabled={submitting}
            className="min-h-11 px-2 text-sm font-bold text-accent disabled:opacity-50"
          >
            保存
          </button>
        </DrawerHeader>

        {/* タイプタブ */}
        <div
          className="flex h-11 gap-1 mx-4 mb-3 bg-[#F3F4F6] rounded-[12px] p-[3px]"
          role="radiogroup"
          aria-label="項目種別"
        >
          {(['income', 'expense', 'carryover'] as const).map((t) => {
            const active = entryType === t
            const cfg = typeConfig[t]
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
                className={`flex-1 rounded-lg text-[13px] text-center transition-colors ${
                  active
                    ? 'bg-[#2563EB] text-white font-semibold'
                    : 'text-[#666666]'
                }`}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>

        {/* フォーム */}
        <form
          id="add-entry-form"
          ref={formRef}
          action={handleSubmit}
          className="flex flex-col gap-3 px-4 pb-4"
        >
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
              className="h-11 rounded-lg bg-[#F3F4F6]"
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
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666] text-sm">¥</span>
              <Input
                id={`${formId}-amount`}
                name="amount"
                type="number"
                inputMode="numeric"
                placeholder="0"
                className="h-11 rounded-lg border border-[#E5E7EB] pl-7 text-[28px] font-bold text-right font-tabular tracking-[-0.02em]"
                min={1}
                required
              />
            </div>
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

          {entryType === 'expense' && (
            <ToggleSwitch
              checked={isCarryover}
              onChange={setIsCarryover}
              label="繰越扱いにする"
              description="精算には含めず翌月へ"
            />
          )}

          {entryType === 'carryover' && (
            <ToggleSwitch
              checked={isCleared}
              onChange={setIsCleared}
              label="今月で清算する"
              description="精算に含める"
            />
          )}

          {error && (
            <p className="text-sm text-neon-red">{error}</p>
          )}
        </form>

        <div className="px-4 pb-4">
          <button
            type="submit"
            form="add-entry-form"
            disabled={submitting}
            className="w-full h-12 bg-[#2563EB] text-white rounded-[12px] text-[15px] font-bold text-center shadow-[0_4px_12px_#2563EB33] disabled:opacity-50 transition-opacity"
          >
            {submitting ? '追加中...' : `${typeConfig[entryType].label}を追加`}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
