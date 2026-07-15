import * as React from 'react'
import { BrandMark, type BrandTone, type BrandVariant } from '@/components/brand/brand-mark'
import { cn } from '@/lib/utils'

interface BrandLogoProps extends React.ComponentProps<'div'> {
  variant?: BrandVariant
  tone?: BrandTone
  compact?: boolean
}

export function BrandLogo({
  variant = 'color',
  tone = 'default',
  compact = false,
  className,
  'aria-label': ariaLabel = 'ヤマワケ',
  role = 'img',
  ...props
}: BrandLogoProps) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      data-variant={variant}
      data-tone={tone}
      data-compact={compact || undefined}
      className={cn('inline-flex items-center gap-2', className)}
      {...props}
    >
      <BrandMark
        variant={variant}
        tone={tone}
        aria-hidden="true"
        className={compact ? 'size-8' : 'size-7'}
      />
      {!compact && (
        <span
          aria-hidden="true"
          className={cn(
            'text-[15px] font-semibold tracking-[0.08em]',
            tone === 'inverse' ? 'text-white' : 'text-foreground'
          )}
        >
          ヤマワケ
        </span>
      )}
    </div>
  )
}

export type { BrandLogoProps }
