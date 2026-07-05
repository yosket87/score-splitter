'use client'

import Link from 'next/link'
import { LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { logout } from '@/app/actions/auth'

interface HeaderActionsProps {
  variant?: 'default' | 'hero'
}

export function HeaderActions({ variant = 'default' }: HeaderActionsProps) {
  const iconClass = variant === 'hero'
    ? 'text-sky-900/70 hover:text-sky-950 dark:text-white/70 dark:hover:text-white'
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
      <form action={logout}>
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
