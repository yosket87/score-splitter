import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PasskeySettings } from '@/features/passkey'
import { HeaderActions } from '@/components/layout/header-actions'
import { requireAuth } from '@/lib/webauthn/session'

export default async function SettingsPage() {
  await requireAuth()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-sub-text hover:text-accent transition-colors"
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
        <PasskeySettings />
      </main>
    </div>
  )
}
