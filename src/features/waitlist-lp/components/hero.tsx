import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-amber-50 via-rose-50/60 to-background px-6 pt-20 pb-16 text-center sm:pt-28 dark:from-amber-950/30 dark:via-rose-950/20 dark:to-background">
      {/* 装飾ブロブ（視覚のみ） */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-rose-200/50 blur-3xl dark:bg-rose-500/10"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 top-32 size-80 rounded-full bg-amber-200/50 blur-3xl dark:bg-amber-500/10"
        aria-hidden="true"
      />

      <div className="relative">
        <p className="text-sm font-semibold tracking-widest text-primary">
          ヤマワケ（仮称）
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-100/80 px-3 py-1 text-xs font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200">
          <Sparkles className="size-3.5" aria-hidden="true" />
          先行登録で6ヶ月無料
        </span>
        <h1 className="mx-auto mt-4 max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">
          ふたりの収入から、ふたりの経費を引いて、
          <span className="bg-gradient-to-r from-primary to-rose-500 bg-clip-text text-transparent">
            残りを山分け。
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
          共働き夫婦の毎月の精算を、1つの数字で終わらせる家計アプリを準備中です。
          ふたりはひとつのチーム。どちらの収入が減っても、同じ仕組みのまま支え合えます。
        </p>
        <Button asChild size="lg" className="mt-8">
          <a href="#signup">ウェイトリストに登録</a>
        </Button>
      </div>
    </section>
  )
}
