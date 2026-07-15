import { PasskeySettings } from '@/features/passkey'
import { Header } from '@/components/layout/header'
import { requireAuth } from '@/lib/webauthn/session'

export default async function SettingsPage() {
  await requireAuth()

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <Header backHref="/" backLabel="トップへ戻る" />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-5 lg:py-8"
      >
        <section className="app-solid-panel mx-auto max-w-2xl rounded-[24px] p-5 sm:p-7">
          <div className="mb-6">
            <p className="text-[11px] font-bold tracking-[0.14em] text-sub-text">
              設定
            </p>
            <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em]">
              パスキー管理
            </h1>
          </div>
          <PasskeySettings />
        </section>
      </main>
    </div>
  )
}
