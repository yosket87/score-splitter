import { googleOAuthConfig } from '@/lib/auth/google-config'
import { redirect } from 'next/navigation'
import { LoginForm } from './login-form'
import { isAuthenticated } from '@/lib/webauthn/session'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  if (await isAuthenticated()) {
    redirect('/')
  }

  const { google } = await searchParams
  const messages: Record<string, string> = { error: 'Googleログインを完了できませんでした。もう一度お試しください。', canceled: 'Googleログインをキャンセルしました。', recovered: 'アカウントを復旧しました。Googleでログインし直してください。' }
  return <LoginForm googleEnabled={!!googleOAuthConfig()} googleMessage={google ? messages[google] : undefined} />
}
