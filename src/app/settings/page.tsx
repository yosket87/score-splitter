import { cookies, headers } from 'next/headers'
import { getGoogleAccount } from '@/lib/api/google-auth'
import { GoogleAccountSettings } from '@/features/google-auth/google-account-settings'
import { PasskeySettings } from '@/features/passkey'
import { Header } from '@/components/layout/header'
import { requireAuth } from '@/lib/webauthn/session'
import { firebaseAuthConfig } from '@/lib/auth/firebase-config'
import { getFirebaseAccount } from '@/lib/api/firebase-auth'
import { FirebaseAccountSettings } from '@/features/firebase-auth/firebase-account-settings'

export default async function SettingsPage() {
  const { householdId, authMethod } = await requireAuth()
  const token = (await cookies()).get('household_session')?.value
  const account = authMethod === 'google' && token ? await getGoogleAccount(token) : null
  const firebaseAccount = authMethod === 'firebase' && token ? await getFirebaseAccount(token) : null
  const firebaseConfig = firebaseAuthConfig()
  const firebaseHost = firebaseConfig && (await headers()).get('host') === new URL(firebaseConfig.origin).host

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
          {firebaseAccount && firebaseConfig && firebaseHost && <FirebaseAccountSettings config={firebaseConfig.client} uid={firebaseAccount.uid} email={firebaseAccount.email} />}
          <h2 className="mb-4 text-lg font-bold">パスキー管理</h2>
          <PasskeySettings householdId={householdId} />
        </section>
      </main>
    </div>
  )
}
