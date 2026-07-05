'use client'

import { HeaderActions } from '@/components/layout/header-actions'

export function Header() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur">
      <div className="px-5 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <span className="text-[12px] font-bold tracking-[1px] uppercase text-foreground">
          Score Splitter
        </span>
        <HeaderActions />
      </div>
    </header>
  )
}
