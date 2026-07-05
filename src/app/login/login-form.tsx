'use client'

import { useActionState, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { login } from '@/app/actions/auth'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { PasskeyLoginButton } from '@/features/passkey/components/passkey-login-button'

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, {})
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="min-h-screen gradient-page flex flex-col">
      {/* ヘッダー */}
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-5 py-3.5 backdrop-blur">
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-sub-text">
          Score Splitter
        </span>
        <ThemeToggle />
      </header>

      {/* メイン */}
      <main id="main" tabIndex={-1} className="flex-1 px-5 pt-10 pb-4 flex flex-col max-w-md mx-auto w-full">
        {/* ヒーロー */}
        <section className="pb-6">
          <div className="w-12 h-12 rounded-[12px] bg-gradient-to-br from-sky-700 to-orange-600 text-white flex items-center justify-center shadow-fab dark:from-sky-300 dark:to-orange-300 dark:text-slate-950">
            <span className="text-[22px] font-bold">S</span>
          </div>
          <h1 className="text-[22px] font-bold leading-[1.05] mt-4">
            Score Splitter
          </h1>
          <p className="text-[13px] text-sub-text mt-2.5 leading-relaxed">
            パスワードを入力してログインしてください。
            <br />
            セッションは7日間保持されます。
          </p>
        </section>

        {/* パスワードフォーム */}
        <div className="rounded-[20px] border border-sky-100/80 bg-card/95 p-[18px] shadow-soft-lg dark:border-white/10">
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

              <div className="rounded-[12px] bg-sky-50/80 flex items-center px-4 h-12 dark:bg-muted">
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
                  className="text-[11px] font-bold tracking-[0.10em] uppercase text-accent shrink-0"
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
              className="mt-1 h-12 px-5 bg-accent text-accent-foreground rounded-[12px] text-[13px] font-bold tracking-[0.14em] uppercase flex items-center justify-between shadow-fab disabled:opacity-50 transition-colors hover:bg-sky-700 dark:hover:bg-sky-300"
            >
              <span>{isPending ? 'ログイン中…' : 'ログイン'}</span>
              {!isPending && (
                <ArrowRight
                  className="h-4 w-4 text-orange-100 dark:text-orange-950"
                  aria-hidden="true"
                />
              )}
            </button>
          </form>

          {/* パスキーログイン */}
          <div className="mt-4">
            <PasskeyLoginButton />
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="px-5 py-5">
        <p className="text-[11px] text-sub-text leading-relaxed">
          パスワードを忘れた場合は
          <br />
          管理者に問い合わせてください。
        </p>
      </footer>
    </div>
  )
}
