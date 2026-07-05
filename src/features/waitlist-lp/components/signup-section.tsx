import { Sparkles } from 'lucide-react'
import { WaitlistForm } from './waitlist-form'

export function SignupSection() {
  return (
    <section
      id="signup"
      className="bg-gradient-to-b from-background to-sky-50/80 px-6 py-16 dark:to-sky-950/20"
    >
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-2xl font-bold">先行登録を受付中</h2>
        <div className="mt-6 rounded-xl border border-sky-200/70 bg-background p-8 shadow-md dark:border-sky-900/50">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/70 bg-orange-100/80 px-3 py-1 text-xs font-medium text-orange-900 dark:border-orange-700/60 dark:bg-orange-950/50 dark:text-orange-200">
            <Sparkles className="size-3.5" aria-hidden="true" />
            先行登録で6ヶ月無料
          </span>
          <p className="mt-4 text-4xl font-bold">
            月380円
            <span className="text-base font-normal text-muted-foreground">
              /世帯（想定）
            </span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            先行登録者は6ヶ月無料でご案内する予定です。
          </p>
          <div className="mt-8 text-left">
            <WaitlistForm idPrefix="signup-waitlist" />
          </div>
        </div>
      </div>
    </section>
  )
}
