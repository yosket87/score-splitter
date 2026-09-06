import Link from 'next/link'
import { cookies } from 'next/headers'
import { getGoogleMigrationDisplay } from '@/lib/api/google-auth'
import { migrationCookie, migrationCookieSchema, parseCookie } from '@/lib/auth/google-cookies'
import { googleOAuthConfig } from '@/lib/auth/google-config'
import { GoogleLoginLink, GoogleRecoveryHelp } from '@/features/google-auth/google-login-link'
import { MigrationCode } from '@/features/google-auth/migration-code'
import { BrandLogo } from '@/components/brand/brand-logo'
export const dynamic = 'force-dynamic'
export default async function MigrationPage() {
  const cookie = parseCookie((await cookies()).get(migrationCookie)?.value, migrationCookieSchema)
  const request = cookie ? await getGoogleMigrationDisplay(cookie.id, cookie.secret, cookie.code).catch(() => null) : null
  return <div className="app-shell min-h-screen px-5 py-8">
    <main id="main" className="app-solid-panel mx-auto w-full max-w-lg space-y-6 rounded-3xl p-5 sm:p-8">
      <BrandLogo />
      <h1 className="text-2xl font-bold leading-snug">{request ? '家計への参加を確認しています' : 'もう一度ログインしてください'}</h1>
      {request ? <>
        <p className="break-all text-sm text-sub-text">{request.email}</p>
        <p className="text-sm leading-relaxed">照合コードを、これまで使っていた信頼できる連絡手段で家計の管理者へ伝えてください。管理者が本人確認を行った後に、家計へ参加できます。</p>
        <MigrationCode code={request.code} />
        <p className="text-sm leading-relaxed">{request.status === 'approved' ? '確認が完了しました。Googleでログインし直してください。' : '承認後に、同じGoogleアカウントでログインし直してください。'}</p>
      </> : <p className="text-sm leading-relaxed">申請の期限が切れたか、このブラウザでは申請を確認できません。Googleでログインしてやり直してください。</p>}
      {googleOAuthConfig() ? <GoogleLoginLink /> : <Link className="underline" href="/login">ログイン画面へ</Link>}
      <GoogleRecoveryHelp />
    </main>
  </div>
}
