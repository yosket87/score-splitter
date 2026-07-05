import type { LucideIcon } from 'lucide-react'

interface SectionCardProps {
  icon: LucideIcon
  title: string
  description: string
  layout?: 'stack' | 'row'
}

export function SectionCard({
  icon: Icon,
  title,
  description,
  layout = 'stack',
}: SectionCardProps) {
  const chip = (
    <span
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-rose-100 text-rose-600 dark:from-amber-900/40 dark:to-rose-900/40 dark:text-rose-300"
      aria-hidden="true"
    >
      <Icon className="size-5" />
    </span>
  )

  if (layout === 'row') {
    return (
      <div className="flex items-start gap-4 rounded-2xl border bg-background p-6 shadow-sm">
        {chip}
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-background p-6 shadow-sm">
      {chip}
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
