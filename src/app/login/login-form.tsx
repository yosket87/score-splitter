'use client'

import { useActionState, useState } from 'react'
import { login } from '@/app/actions/auth'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { PasskeyLoginButton } from '@/features/passkey/components/passkey-login-button'

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, {})
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span className="text-eyebrow text-sub-text">
          Score Splitter
        </span>
        <ThemeToggle />
      </header>

      {/* メイン */}
      <main id="main" tabIndex={-1} className="flex-1 px-5 pt-10 pb-4 flex flex-col max-w-md mx-auto w-full">
        {/* ヒーロー */}
        <section className="pb-6">
          <div className="w-12 h-12 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
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
        <div className="rounded-2xl bg-card p-[18px]">
          <form action={formAction} className="flex flex-col gap-3.5">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label
                  htmlFor="password"
                  className="text-eyebrow text-sub-text"
                >
                  パスワード
                </label>
                <span className="text-[10px] text-sub-text font-tabular">
                  パスワードの表示状態: {showPassword ? '表示' : '非表示'}
                </span>
              </div>

              <div className="rounded-lg bg-muted flex items-center px-4 h-12">
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
                  className="text-eyebrow text-accent shrink-0"
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
              className="mt-1 h-12 px-6 bg-accent text-accent-foreground rounded-full text-[15px] font-semibold flex items-center justify-between disabled:opacity-50 transition-opacity"
            >
              <span>{isPending ? 'ログイン中…' : 'ログイン'}</span>
              {!isPending && <span className="text-lg font-normal">→</span>}
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
