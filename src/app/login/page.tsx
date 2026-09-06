import { googleOAuthConfig } from '@/lib/auth/google-config'
import { redirect } from 'next/navigation'
import { LoginForm } from './login-form'
import { isAuthenticated } from '@/lib/webauthn/session'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string | string[] }> }) {
  if (await isAuthenticated()) {
    redirect('/')
  }

  const { google } = await searchParams
  const messages = { error: 'Googleログインを完了できませんでした。もう一度お試しください。', canceled: 'Googleログインをキャンセルしました。', recovered: 'アカウントを復旧しました。Googleでログインし直してください。' }
  const googleMessage = google === 'error' || google === 'canceled' || google === 'recovered' ? messages[google] : undefined
  return <LoginForm googleEnabled={!!googleOAuthConfig()} googleMessage={googleMessage} />
}
