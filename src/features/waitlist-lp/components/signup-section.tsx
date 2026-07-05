import { WaitlistForm } from './waitlist-form'

export function SignupSection() {
  return (
    <section id="signup" className="px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-2xl font-bold">先行登録を受付中</h2>
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
          <WaitlistForm />
        </div>
      </div>
    </section>
  )
}
