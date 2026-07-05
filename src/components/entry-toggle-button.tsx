'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface EntryToggleButtonProps {
  active: boolean
  activeIcon: ReactNode
  inactiveIcon: ReactNode
  ariaLabel: string
}

export function EntryToggleButton({
  active,
  activeIcon,
  inactiveIcon,
  ariaLabel,
}: EntryToggleButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`-m-2 flex h-11 w-11 items-center justify-center rounded-full text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed ${
        active
          ? 'text-accent bg-accent/10'
          : 'text-muted-foreground hover:text-accent hover:bg-accent/10'
      }`}
      aria-label={ariaLabel}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        active ? activeIcon : inactiveIcon
      )}
    </button>
  )
}
