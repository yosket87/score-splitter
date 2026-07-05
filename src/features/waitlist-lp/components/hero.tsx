import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="px-6 pt-20 pb-16 text-center sm:pt-28">
      <p className="text-sm font-semibold tracking-widest text-primary">
        ヤマワケ（仮称）
      </p>
      <h1 className="mx-auto mt-4 max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">
        ふたりの収入から、ふたりの経費を引いて、残りを山分け。
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
        共働き夫婦の毎月の精算を、1つの数字で終わらせる家計アプリを準備中です。
        ふたりはひとつのチーム。どちらの収入が減っても、同じ仕組みのまま支え合えます。
      </p>
      <Button asChild size="lg" className="mt-8">
        <a href="#signup">ウェイトリストに登録</a>
      </Button>
    </section>
  )
}
