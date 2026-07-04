'use client'

import { useId, useState } from 'react'
import { Pencil } from 'lucide-react'
import { TYPE_LABELS } from '@/lib/constants'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { PersonSelector } from '@/components/ui/person-selector'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
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
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [person, setPerson] = useState<Person>(initialPerson)
  const [isCarryover, setIsCarryover] = useState(initialIsCarryover ?? false)
  const [isCleared, setIsCleared] = useState(initialIsCleared ?? false)
  const isMobile = useIsMobile()

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
          defaultValue={label}
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
          defaultValue={displayAmount}
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

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="px-4 pb-safe">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="pb-4">{form}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  )
}
