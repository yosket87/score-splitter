'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LottiePlayer } from '@/components/animations/lottie-player'
import { listExit, listSpring } from '@/components/animations/tokens'
import { PERSON_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Person } from '@/types'

interface SectionShellProps {
  title: string
  meta: ReactNode
  dataSection: string
  isEmpty: boolean
  emptyLabel: string
  addSlot: ReactNode
  children: ReactNode
  totalSlot?: ReactNode
  titleTestId?: string
  as?: 'div' | 'section'
}

export function SectionShell({
  title,
  meta,
  dataSection,
  isEmpty,
  emptyLabel,
  addSlot,
  children,
  totalSlot,
  titleTestId,
  as = 'div',
}: SectionShellProps) {
  const Root = as

  return (
    <Root data-section={dataSection}>
      <div className="flex items-baseline justify-between pb-2 mb-1">
        <h3
          data-testid={titleTestId}
          className="text-[11px] font-bold tracking-[0.8px] text-foreground uppercase"
        >
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {meta}
        </span>
      </div>

      <div className="rounded-2xl bg-card overflow-hidden">
        <div className="border-b border-border" />
        <AnimatePresence initial={false}>
          {children}
        </AnimatePresence>

        {isEmpty && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground animate-fade-in">
            <LottiePlayer
              src="/lottie/empty-box.json"
              className="w-12 h-12"
              ariaLabel={emptyLabel}
            />
            <p className="text-xs">{emptyLabel}</p>
          </div>
        )}

        <div className="border-t border-border bg-[var(--surface-total)] px-3.5 py-2.5">
          {addSlot}
        </div>

        {totalSlot}
      </div>
    </Root>
  )
}

interface EntryRowProps {
  id: string
  label: string
  person: Person
  amount: ReactNode
  isLast: boolean
  actions: ReactNode
  amountClassName?: string
  labelClassName?: string
  personBadgeClassName?: string
  labelBadge?: ReactNode
  opacity?: number
}

export function EntryRow({
  id,
  label,
  person,
  amount,
  isLast,
  actions,
  amountClassName,
  labelClassName,
  personBadgeClassName,
  labelBadge,
  opacity = 1,
}: EntryRowProps) {
  return (
    <motion.div
      key={id}
      data-testid="item-row"
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity, y: 0 }}
      exit={{ opacity: 0, x: -8, transition: listExit }}
      transition={listSpring}
      className={cn(
        'group grid grid-cols-[22px_1fr_auto] gap-3 px-3.5 py-3 items-center',
        !isLast && 'border-b border-border'
      )}
    >
      <span
        className={cn(
          'w-[22px] h-[22px] rounded-full text-white text-[8px] font-bold inline-flex items-center justify-center shrink-0',
          person === 'husband' ? 'bg-husband' : 'bg-wife',
          personBadgeClassName
        )}
      >
        {PERSON_LABELS[person]}
      </span>
      <span className={cn('text-[13px] font-medium truncate', labelClassName)}>
        {label}
        {labelBadge}
      </span>
      <div className="flex items-center gap-1">
        <span className={cn('font-mono text-[13px] font-semibold', amountClassName)}>
          {amount}
        </span>
        <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
          {actions}
        </div>
      </div>
    </motion.div>
  )
}
