'use client'

import { useActionState, useState } from 'react'
import { login } from '@/app/actions/auth'
import { BrandLogo } from '@/components/brand/brand-logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { PasskeyLoginButton } from '@/features/passkey/components/passkey-login-button'

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, {})
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <header className="app-sticky-glass">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-5">
          <BrandLogo />
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-4 pt-10"
      >
        <section className="pb-6">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">
            ヤマワケ
          </h1>
          <p className="mt-2.5 text-[13px] leading-relaxed text-sub-text">
            パスワードを入力してログインしてください。
            <br />
            セッションは7日間保持されます。
          </p>
        </section>

        <div className="app-glass-heavy rounded-[24px] p-[18px]">
          <form action={formAction} className="flex flex-col gap-3.5">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label
                  htmlFor="password"
                  className="text-[11px] font-bold tracking-[0.14em] uppercase text-sub-text"
                >
                  パスワード
                </label>
                <span className="text-[10px] text-sub-text font-tabular">
                  パスワードの表示状態: {showPassword ? '表示' : '非表示'}
                </span>
              </div>

              <div className="rounded-[12px] bg-muted flex items-center px-4 h-12">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="パスワード"
                  required
                  autoFocus
                  className="flex-1 text-[20px] font-semibold tracking-[0.30em] bg-transparent border-none outline-none font-tabular placeholder:text-muted-foreground/40 placeholder:tracking-normal placeholder:text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="min-h-11 shrink-0 px-2 text-[11px] font-bold tracking-[0.10em] text-accent"
                >
                  {showPassword ? '隠す' : '表示'}
                </button>
              </div>
            </div>

            {state.error && (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                <span className="text-[12px] font-semibold text-destructive">{state.error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-1 h-12 px-5 bg-accent text-accent-foreground rounded-[12px] text-[13px] font-bold tracking-[0.14em] uppercase flex items-center justify-between shadow-fab disabled:opacity-50 transition-opacity"
            >
              <span>{isPending ? 'ログイン中…' : 'ログイン'}</span>
              {!isPending && <span aria-hidden="true" className="text-lg font-normal">→</span>}
            </button>
          </form>

          <div className="mt-4">
            <PasskeyLoginButton />
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md px-5 py-5">
        <p className="text-[11px] text-sub-text leading-relaxed">
          パスワードを忘れた場合は
          <br />
          管理者に問い合わせてください。
        </p>
      </footer>
    </div>
  )
}
