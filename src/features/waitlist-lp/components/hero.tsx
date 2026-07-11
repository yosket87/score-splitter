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
    <section className="relative overflow-hidden border-b bg-gradient-to-b from-sky-50 via-background to-background px-5 pt-16 pb-12 sm:pt-24 sm:pb-16 dark:from-sky-950/25 dark:via-background dark:to-background">
      <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:items-center">
        <div>
          <p className="text-sm font-semibold tracking-widest text-sky-700 dark:text-sky-300">
            ヤマワケ（仮称）
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-orange-300/70 bg-orange-100/80 px-3 py-1 text-xs font-medium text-orange-900 dark:border-orange-700/60 dark:bg-orange-950/50 dark:text-orange-200">
            <Sparkles className="size-3.5" aria-hidden="true" />
            先行登録で6ヶ月無料
          </span>
          <h1 className="mt-4 max-w-2xl text-3xl leading-tight font-bold text-slate-950 sm:text-5xl dark:text-slate-50">
            ふたりの収入から、ふたりの経費を引いて、
            <span className="bg-gradient-to-r from-sky-700 to-orange-600 bg-clip-text text-transparent dark:from-sky-300 dark:to-orange-300">
              残りを山分け。
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-muted-foreground">
            共働き夫婦の毎月の精算を、1つの数字で終わらせる家計アプリを準備中です。
            ふたりはひとつのチーム。どちらの収入が減っても、同じ仕組みのまま支え合えます。
          </p>

          <div className="mt-6 grid max-w-xl gap-2 sm:grid-cols-3">
            {trustItems.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="flex min-h-11 items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 text-sm font-medium shadow-sm"
                >
                  <Icon
                    className="size-4 shrink-0 text-sky-700 dark:text-sky-300"
                    aria-hidden="true"
                  />
                  <span>{item.title}</span>
                </div>
              )
            })}
          </div>

          <div className="mt-6 max-w-xl rounded-xl border bg-background/90 p-4 backdrop-blur sm:p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              公開時に優先案内を受け取る
            </p>
            <WaitlistForm idPrefix="hero-waitlist" variant="compact" />
          </div>
        </div>

        <div className="relative lg:pl-4">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <Image
              src="/lp/monthly-dashboard-preview.png"
              alt="ヤマワケの月次画面で収支、お小遣い、精算額を表示しているプレビュー"
              width={960}
              height={720}
              priority
              className="h-auto w-full"
            />
          </div>
          <div className="absolute right-4 bottom-4 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
            <p className="text-xs font-medium text-muted-foreground">今月の精算</p>
            <p className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-300">
              ¥40,000
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              パートナー → あなた
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
