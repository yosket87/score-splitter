import { googleOAuthConfig } from '@/lib/auth/google-config'
import { redirect } from 'next/navigation'
import { LoginForm } from './login-form'
import { isAuthenticated } from '@/lib/webauthn/session'
import { firebaseAuthConfig } from '@/lib/auth/firebase-config'
import { headers } from 'next/headers'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string | string[]; firebase?: string | string[] }> }) {
  if (await isAuthenticated()) {
    redirect('/')
  }

  const { google, firebase } = await searchParams
  const messages = { error: 'Googleログインを完了できませんでした。もう一度お試しください。', canceled: 'Googleログインをキャンセルしました。', recovered: 'アカウントを復旧しました。Googleでログインし直してください。' }
  const googleMessage = google === 'error' || google === 'canceled' || google === 'recovered' ? messages[google] : undefined
  const config = firebaseAuthConfig()
  const host = (await headers()).get('host')
  const firebaseConfig = config && host === new URL(config.origin).host ? config.client : undefined
  return <LoginForm googleEnabled={!config && !!googleOAuthConfig()} firebaseConfig={firebaseConfig}
    googleMessage={firebase === 'recovered' ? 'アカウントを復旧しました。もう一度ログインしてください。' : googleMessage} />
}
