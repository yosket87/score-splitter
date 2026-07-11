'use client'

import { HeaderActions } from '@/components/layout/header-actions'
import { cn } from '@/lib/utils'

interface HeaderProps {
  tone?: 'default' | 'hero'
}

export function Header({ tone = 'default' }: HeaderProps) {
  const isHero = tone === 'hero'

  return (
    <header
      className={cn(
        'sticky top-0 z-50 backdrop-blur-xl',
        isHero ? 'bg-hero-tile/80' : 'bg-background/80'
      )}
    >
      <div className="px-5 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <span
          className={cn(
            'text-eyebrow',
            isHero ? 'text-white' : 'text-foreground'
          )}
        >
          Score Splitter
        </span>
        <HeaderActions variant={isHero ? 'hero' : 'default'} />
      </div>
    </header>
  )
}
