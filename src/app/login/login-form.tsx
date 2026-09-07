'use client'

import { GoogleLoginLink, GoogleRecoveryHelp } from '@/features/google-auth/google-login-link'
import { useActionState, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { login } from '@/app/actions/auth'
import { BrandMark } from '@/components/brand/brand-mark'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { PasskeyLoginButton } from '@/features/passkey'
import { FirebaseLogin } from '@/features/firebase-auth/firebase-login'
import type { FirebaseClientConfig } from '@/lib/auth/firebase-client-config'

export function LoginForm({ googleEnabled = false, googleMessage, firebaseConfig }: { googleEnabled?: boolean; googleMessage?: string; firebaseConfig?: FirebaseClientConfig }) {
  const [state, formAction, isPending] = useActionState(login, {})
  const [showPassword, setShowPassword] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
    <div className="app-shell flex min-h-svh flex-col">
      <header className="flex justify-end px-4 pt-3 sm:px-6">
        <ThemeToggle />
      </header>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-12 pt-6 sm:py-12">
        <section aria-labelledby="login-heading" className="app-glass-heavy rounded-[28px] px-6 py-8 sm:px-8 sm:py-10">
          <div className="mb-7 text-center">
            <BrandMark className="mx-auto size-12" />
            <p className="mt-3 text-xl font-semibold tracking-[0.08em]">ヤマワケ</p>
            <h1 id="login-heading" className="mt-6 text-xl font-bold leading-relaxed tracking-tight">ふたりの家計を、ひとつに。</h1>
            <p className="mt-2 text-sm text-sub-text">いつもの方法でログイン</p>
          </div>

          {googleMessage && <p role="status" className="mb-4 text-sm leading-relaxed">{googleMessage}</p>}
          <div className="space-y-3">
            {firebaseConfig && <FirebaseLogin config={firebaseConfig} />}
            {googleEnabled && !firebaseConfig && <GoogleLoginLink />}
            <PasskeyLoginButton />
          </div>

          <div className="my-6 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-sub-text">または</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <button type="button" aria-expanded={passwordOpen} aria-controls="password-login-panel"
            disabled={isPending} onClick={() => setPasswordOpen(open => !open)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            パスワードでログイン
            <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${passwordOpen ? 'rotate-180' : ''}`} />
          </button>
          <div id="password-login-panel">
            {passwordOpen && <form action={formAction} className="mt-5 flex flex-col gap-4">
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium">パスワード</label>
                <div className="flex h-12 items-center rounded-xl border border-border bg-background/70 px-3 focus-within:ring-2 focus-within:ring-ring">
                  <input id="password" type={showPassword ? 'text' : 'password'} name="password" placeholder="パスワード"
                    required autoComplete="current-password"
                    className="min-w-0 flex-1 border-none bg-transparent text-base outline-none placeholder:text-muted-foreground" />
                  <button type="button" aria-label={showPassword ? '隠す' : '表示'} aria-pressed={showPassword}
                    onClick={() => setShowPassword(value => !value)} className="min-h-11 shrink-0 px-2 text-xs font-medium text-accent">
                    {showPassword ? '隠す' : '表示'}
                  </button>
                </div>
              </div>
              {state.error && <p role="alert" className="text-sm leading-relaxed text-destructive">{state.error}</p>}
              <button type="submit" disabled={isPending}
                className="h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground transition-opacity disabled:opacity-50">
                {isPending ? 'ログイン中…' : 'ログイン'}
              </button>
            </form>}
          </div>
        </section>
        <div className="mt-6 text-center text-xs leading-relaxed text-sub-text">
          <details>
            <summary className="mx-auto w-fit cursor-pointer rounded-md px-2 py-3 text-accent focus-visible:outline-2 focus-visible:outline-ring">ログインでお困りの方へ</summary>
            <div className="mt-2 space-y-3 text-left">
              <p>パスワードを忘れた場合は、管理者に問い合わせてください。</p>
              <GoogleRecoveryHelp />
            </div>
          </details>
        </div>
      </main>
    </div>
  )
}
