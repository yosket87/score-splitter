'use client'

import { HeaderActions } from '@/components/layout/header-actions'

export function Header() {
  return (
    <header className="bg-background">
      <div className="px-5 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <span className="text-eyebrow text-foreground">
          Score Splitter
        </span>
        <HeaderActions />
      </div>
    </header>
  )
}
