import { Sparkles } from 'lucide-react'
import { WaitlistForm } from './waitlist-form'

export function SignupSection() {
  return (
    <section id="signup" className="bg-card px-6 py-20">
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-3xl font-bold tracking-tight">先行登録を受付中</h2>
        <div className="mt-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Sparkles className="size-3.5" aria-hidden="true" />
            先行登録で6ヶ月無料
          </span>
          <p className="mt-5 text-6xl font-bold tracking-tight">
            月380円
            <span className="text-base font-normal tracking-normal text-muted-foreground">
              /世帯（想定）
            </span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            先行登録者は6ヶ月無料でご案内する予定です。
          </p>
          <div className="mt-10 rounded-2xl bg-background p-6 text-left">
            <WaitlistForm idPrefix="signup-waitlist" />
          </div>
        </div>
      </div>
    </section>
  )
}
