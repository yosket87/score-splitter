import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PasskeySettings } from '@/features/passkey'
import { HeaderActions } from '@/components/layout/header-actions'
import { requireAuth } from '@/lib/webauthn/session'

export default async function SettingsPage() {
  await requireAuth()

  return (
    <div className="min-h-screen gradient-page flex flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sub-text transition-colors hover:bg-sky-50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-white/10"
            aria-label="戻る"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-sub-text">
            設定
          </span>
        </div>
        <HeaderActions />
      </header>

      <main id="main" tabIndex={-1} className="flex-1 px-5 pt-6 pb-8 max-w-md mx-auto w-full">
        <h1 className="text-[18px] font-bold tracking-[-0.02em] mb-6">
          パスキー管理
        </h1>
        <div className="rounded-[20px] border border-sky-100/80 bg-card/95 p-5 shadow-soft-lg dark:border-white/10">
          <PasskeySettings />
        </div>
      </main>
    </div>
  )
}
