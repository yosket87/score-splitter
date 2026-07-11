import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  icon: LucideIcon
  title: string
  description: string
  layout?: 'stack' | 'row'
  tone?: 'light' | 'dark'
}

export function SectionCard({
  icon: Icon,
  title,
  description,
  layout = 'stack',
  tone = 'light',
}: SectionCardProps) {
  const isDark = tone === 'dark'

  const chip = (
    <span
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full',
        isDark ? 'bg-white/10 text-white' : 'bg-accent/10 text-accent'
      )}
      aria-hidden="true"
    >
      <Icon className="size-5" />
    </span>
  )

  if (layout === 'row') {
    return (
      <div className="flex items-start gap-4 py-6 first:pt-0 last:pb-0">
        {chip}
        <div>
          <h3 className={cn('font-semibold', isDark && 'text-white')}>
            {title}
          </h3>
          <p
            className={cn(
              'mt-2 text-sm leading-relaxed',
              isDark ? 'text-white/60' : 'text-muted-foreground'
            )}
          >
            {description}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {chip}
      <h3 className={cn('mt-4 font-semibold', isDark && 'text-white')}>
        {title}
      </h3>
      <p
        className={cn(
          'mt-2 text-sm leading-relaxed',
          isDark ? 'text-white/60' : 'text-muted-foreground'
        )}
      >
        {description}
      </p>
    </div>
  )
}
