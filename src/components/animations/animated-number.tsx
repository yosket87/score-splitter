'use client'

import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { formatCurrency } from '@/lib/utils/format'
import { useMotionPrefs } from './use-motion-prefs'
import { motionDuration, motionEase } from './tokens'

interface AnimatedYenProps {
  value: number
  className?: string
  initialValue?: number
  absolute?: boolean
  'data-testid'?: string
}

export function AnimatedYen({
  value,
  className,
  initialValue = 0,
  absolute = false,
  ...rest
}: AnimatedYenProps) {
  const target = absolute ? Math.abs(value) : value
  const mv = useMotionValue(initialValue)
  const formatted = useTransform(mv, (v) => formatCurrency(v))
  const { reduced } = useMotionPrefs()

  useEffect(() => {
    if (reduced) {
      mv.set(target)
      return
    }
    const controls = animate(mv, target, {
      duration: motionDuration.count,
      ease: motionEase.out,
    })
    return () => controls.stop()
  }, [target, reduced, mv])

  return (
    <motion.span className={className} {...rest}>
      {formatted}
    </motion.span>
  )
}
