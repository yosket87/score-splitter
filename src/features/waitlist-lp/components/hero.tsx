import Image from 'next/image'
import { Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { WaitlistForm } from './waitlist-form'

const trustItems = [
  {
    icon: Mail,
    title: 'メールのみで登録',
  },
  {
    icon: ShieldCheck,
    title: '金額は送信されません',
  },
  {
    icon: Sparkles,
    title: '先行登録で6ヶ月無料予定',
  },
] as const

export function Hero() {
  return (
    <section className="bg-card px-5 pt-16 pb-20 sm:pt-24">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="text-eyebrow text-accent">ヤマワケ（仮称）</p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          <Sparkles className="size-3.5" aria-hidden="true" />
          先行登録で6ヶ月無料
        </span>
        <h1 className="mt-5 max-w-2xl text-4xl leading-tight font-bold tracking-tight text-foreground sm:text-6xl">
          ふたりの収入から、ふたりの経費を引いて、残りを山分け。
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
          共働き夫婦の毎月の精算を、1つの数字で終わらせる家計アプリを準備中です。
          ふたりはひとつのチーム。どちらの収入が減っても、同じ仕組みのまま支え合えます。
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {trustItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Icon
                  className="size-4 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <span>{item.title}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-8 w-full max-w-xl rounded-2xl bg-background p-5 text-left sm:p-6">
          <p className="mb-4 text-sm font-semibold text-foreground">
            公開時に優先案内を受け取る
          </p>
          <WaitlistForm idPrefix="hero-waitlist" variant="compact" />
        </div>

        <div className="mt-14 w-full max-w-2xl overflow-hidden rounded-2xl shadow-fab">
          <Image
            src="/lp/monthly-dashboard-preview.png"
            alt="ヤマワケの月次画面で収支、お小遣い、精算額を表示しているプレビュー"
            width={960}
            height={720}
            priority
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  )
}
