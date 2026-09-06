import { isLegacyAuthEnabled } from '@/lib/api/households'
import { cookies } from 'next/headers'
import { getGoogleAccount } from '@/lib/api/google-auth'
import { GoogleAccountSettings } from '@/features/google-auth/google-account-settings'
import { PasskeySettings } from '@/features/passkey'
import { Header } from '@/components/layout/header'
import { requireAuth } from '@/lib/webauthn/session'

export default async function SettingsPage() {
  const { householdId, authMethod } = await requireAuth()
  const legacyEnabled = await isLegacyAuthEnabled({ householdId })
  const token = (await cookies()).get('household_session')?.value
  const account = authMethod === 'google' && token ? await getGoogleAccount(token) : null

  return (
    <div key={householdId} className="app-shell flex min-h-screen flex-col">
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
              アカウント設定
            </h1>
          </div>
          {authMethod === 'google' && <GoogleAccountSettings email={account?.email ?? null} />}
          {legacyEnabled && <>
            <h2 className="mb-4 text-lg font-bold">パスキー管理</h2>
            <PasskeySettings householdId={householdId} />
          </>}
          {!legacyEnabled && <p className="mt-4 text-sm leading-relaxed text-sub-text">この家計はGoogleログインへ移行しました。端末に保存された旧パスキーは、このアプリでは利用できません。</p>}
        </section>
      </main>
    </div>
  )
}
