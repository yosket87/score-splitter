'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BrandLogo } from '@/components/brand/brand-logo'
import { HeaderActions } from '@/components/layout/header-actions'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  backHref?: string
  backLabel?: string
}

export function Header({ backHref, backLabel = '戻る' }: HeaderProps) {
  return (
    <header className="app-sticky-glass">
      <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-3 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-1">
          {backHref && (
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href={backHref} aria-label={backLabel}>
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
          )}
          <BrandLogo className="min-w-0" />
        </div>
        <HeaderActions />
      </div>
    </header>
  )
}

export type { HeaderProps }
