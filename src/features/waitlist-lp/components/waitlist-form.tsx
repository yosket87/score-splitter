'use client'

import { useActionState } from 'react'
import { joinWaitlist } from '@/app/actions/waitlist'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { cn } from '@/lib/utils'
import { useSimulatorUsage } from './simulator-usage-provider'
import type { ActionResult } from '@/types'

interface WaitlistFormProps {
  idPrefix?: string
  variant?: 'default' | 'compact'
}

export function WaitlistForm({
  idPrefix = 'waitlist',
  variant = 'default',
}: WaitlistFormProps) {
  const { simulatorUsed } = useSimulatorUsage()
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    joinWaitlist,
    null
  )
  const isCompact = variant === 'compact'
  const emailId = `${idPrefix}-email`
  const freeOnlyId = `${idPrefix}-price-free-only`
  const paidOkId = `${idPrefix}-price-paid-ok`

  if (state?.success) {
    return (
      <p
        role="status"
        className={cn(
          'rounded-lg bg-muted p-6 text-center font-semibold',
          isCompact && 'bg-white/90 p-4 text-sm text-slate-900 shadow-sm dark:bg-slate-950/80 dark:text-slate-100'
        )}
      >
        登録ありがとうございます。準備ができたらご連絡します。
      </p>
    )
  }

  return (
    <form action={formAction} className={cn(isCompact ? 'space-y-4' : 'space-y-6')}>
      <div className="space-y-2">
        <Label htmlFor={emailId}>メールアドレス</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={cn(isCompact && 'bg-background/90 shadow-sm')}
        />
      </div>

      <fieldset className={cn(isCompact ? 'grid gap-2 sm:grid-cols-2' : 'space-y-2')}>
        <legend className="text-sm font-medium">料金の希望</legend>
        <label
          htmlFor={freeOnlyId}
          className={cn(
            'flex min-h-11 items-center gap-2 text-sm',
            isCompact && 'rounded-lg border bg-background/80 px-3 shadow-sm'
          )}
        >
          <input
            id={freeOnlyId}
            type="radio"
            name="priceIntent"
            value="free_only"
            required
            className="size-4"
          />
          無料なら使いたい
        </label>
        <label
          htmlFor={paidOkId}
          className={cn(
            'flex min-h-11 items-center gap-2 text-sm',
            isCompact && 'rounded-lg border bg-background/80 px-3 shadow-sm'
          )}
        >
          <input
            id={paidOkId}
            type="radio"
            name="priceIntent"
            value="paid_ok"
            required
            className="size-4"
          />
          月380円でも使いたい
        </label>
      </fieldset>

      {/* bot対策: 人間には見えないフィールド。値が入っていたら登録しない */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input type="hidden" name="simulatorUsed" value={String(simulatorUsed)} />

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton
        size={isCompact ? 'lg' : 'default'}
        className={cn(
          'min-h-11 w-full',
          isCompact &&
            'bg-orange-600 text-white shadow-sm hover:bg-orange-700 dark:bg-orange-500 dark:text-slate-950 dark:hover:bg-orange-400'
        )}
        pendingChildren="送信中..."
      >
        ウェイトリストに登録
      </SubmitButton>
    </form>
  )
}
