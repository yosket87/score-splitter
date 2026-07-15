import * as React from 'react'
import { cn } from '@/lib/utils'

type BrandVariant = 'color' | 'mono'
type BrandTone = 'default' | 'inverse'

interface BrandMarkProps extends React.ComponentProps<'svg'> {
  variant?: BrandVariant
  tone?: BrandTone
}

export function BrandMark({
  variant = 'color',
  tone = 'default',
  className,
  'aria-label': ariaLabel = 'ヤマワケ',
  'aria-hidden': ariaHidden,
  ...props
}: BrandMarkProps) {
  const isHidden = ariaHidden === true || ariaHidden === 'true'
  const monoStroke = 'currentColor'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      role={isHidden ? undefined : 'img'}
      aria-label={isHidden ? undefined : ariaLabel}
      aria-hidden={ariaHidden}
      data-variant={variant}
      data-tone={tone}
      className={cn(
        'shrink-0',
        variant === 'mono' && (tone === 'inverse' ? 'text-white' : 'text-foreground'),
        className
      )}
      {...props}
    >
      <path
        d="M4 6 C10 6 12 26 28 26"
        data-person="husband"
        fill="none"
        stroke={variant === 'color' ? 'var(--brand-husband)' : monoStroke}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M4 26 C10 26 12 6 28 6"
        data-person="wife"
        fill="none"
        stroke={variant === 'color' ? 'var(--brand-wife)' : monoStroke}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export type { BrandMarkProps, BrandTone, BrandVariant }
