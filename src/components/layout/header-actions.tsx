'use client'

import Link from 'next/link'
import { signOut } from 'firebase/auth'
import { toast } from 'sonner'
import { useFirebaseClientConfig } from '@/features/firebase-auth/firebase-client-context'
import { getFirebaseAuth } from '@/lib/auth/firebase-client'
import { LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { logout } from '@/app/actions/auth'

interface HeaderActionsProps {
  variant?: 'default' | 'hero'
}

export function HeaderActions({ variant = 'default' }: HeaderActionsProps) {
  const firebase = useFirebaseClientConfig()
  async function handleLogout() {
    try {
      if (firebase && !firebase.mock) await signOut(getFirebaseAuth(firebase))
    } catch {
      // SDKの削除失敗でもサーバーの認証セッションは必ず破棄する。
      toast.error('端末の認証情報を削除できませんでした。共有端末ではブラウザのサイトデータも削除してください。')
    }
    await logout()
  }
  const iconClass = variant === 'hero'
    ? 'text-white/70 hover:text-white'
    : 'text-muted-foreground hover:text-accent'

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle className={iconClass} />
      <Button
        variant="ghost"
        size="icon-sm"
        className={iconClass}
        asChild
        aria-label="設定"
      >
        <Link href="/settings">
          <Settings className="h-4 w-4" />
        </Link>
      </Button>
      <form action={handleLogout}>
        <Button
          variant="ghost"
          size="icon-sm"
          className={iconClass}
          aria-label="ログアウト"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
