'use client'

import { useEffect } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('アプリケーションエラー:', error)
  }, [error])

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-background flex items-center justify-center">
      <Card className="w-full max-w-md relative animate-fade-in">
        <CardContent className="pt-8 pb-8">
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">エラーが発生しました</h2>
              <p className="text-sm text-muted-foreground">
                データの読み込みに失敗しました。再度お試しください。
              </p>
              {error.digest && (
                <p className="text-xs text-muted-foreground">
                  問い合わせコード: {error.digest}
                </p>
              )}
            </div>
            <Button onClick={reset} size="pill">
              <RotateCcw className="h-4 w-4 mr-2" />
              再試行
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
