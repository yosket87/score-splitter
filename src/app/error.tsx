'use client'

import { useEffect } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { BrandLogo } from '@/components/brand/brand-logo'
import { Button } from '@/components/ui/button'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('アプリケーションエラー:', error)
  }, [error])

  return (
    <main
      id="main"
      tabIndex={-1}
      className="app-shell flex min-h-screen items-center justify-center px-4 py-10"
    >
      <section className="app-solid-panel w-full max-w-md rounded-[24px] p-6 text-center sm:p-8">
        <BrandLogo className="justify-center" />
        <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-xl bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="mt-4 space-y-2">
          <h1 className="text-xl font-bold">エラーが発生しました</h1>
          <p className="text-sm text-muted-foreground">
            データの読み込みに失敗しました。再度お試しください。
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              問い合わせコード: {error.digest}
            </p>
          )}
        </div>
        <Button
          onClick={reset}
          className="mt-5 min-h-11 shadow-sm transition-shadow hover:shadow-md"
        >
          <RotateCcw className="h-4 w-4" />
          再試行
        </Button>
      </section>
    </main>
  )
}
