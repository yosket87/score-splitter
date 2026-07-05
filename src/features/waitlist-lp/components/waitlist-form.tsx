'use client'

import { useActionState } from 'react'
import { joinWaitlist } from '@/app/actions/waitlist'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import { useSimulatorUsage } from './simulator-usage-provider'
import type { ActionResult } from '@/types'

export function WaitlistForm() {
  const { simulatorUsed } = useSimulatorUsage()
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    joinWaitlist,
    null
  )

  if (state?.success) {
    return (
      <p role="status" className="rounded-lg bg-muted p-6 text-center font-semibold">
        登録ありがとうございます。準備ができたらご連絡します。
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="waitlist-email">メールアドレス</Label>
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">料金の希望</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="priceIntent" value="free_only" defaultChecked />
          無料なら使いたい
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="priceIntent" value="paid_ok" />
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

      <SubmitButton className="w-full" pendingChildren="送信中...">
        ウェイトリストに登録
      </SubmitButton>
    </form>
  )
}
