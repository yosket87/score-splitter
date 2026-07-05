import Link from 'next/link'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen gradient-page flex items-center justify-center px-5">
      <Card className="w-full max-w-md relative glow-md animate-fade-in">
        <CardContent className="pt-8 pb-8">
          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center">
              <span className="text-accent-foreground text-lg font-bold">?</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">ページが見つかりません</h2>
              <p className="text-sm text-muted-foreground">
                お探しのページは存在しないか、移動した可能性があります。
              </p>
            </div>
            <Button asChild className="glow-sm hover:glow-md transition-shadow">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                ホームに戻る
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
