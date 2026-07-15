import Link from 'next/link'
import { Home } from 'lucide-react'
import { BrandLogo } from '@/components/brand/brand-logo'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="app-shell flex min-h-screen items-center justify-center px-4 py-10"
    >
      <section className="app-solid-panel w-full max-w-md rounded-[24px] p-6 text-center sm:p-8">
        <BrandLogo className="justify-center" />
        <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <span className="text-lg font-bold">?</span>
        </div>
        <div className="mt-4 space-y-2">
          <h1 className="text-xl font-bold">ページが見つかりません</h1>
          <p className="text-sm text-muted-foreground">
            お探しのページは存在しないか、移動した可能性があります。
          </p>
        </div>
        <Button asChild className="mt-5 min-h-11 shadow-sm transition-shadow hover:shadow-md">
          <Link href="/">
            <Home className="h-4 w-4" />
            ホームに戻る
          </Link>
        </Button>
      </section>
    </main>
  )
}
