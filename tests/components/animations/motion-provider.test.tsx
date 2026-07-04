import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MotionProvider } from '@/components/animations/motion-provider'

vi.mock('motion/react', () => ({
  domAnimation: {},
  LazyMotion: ({ children }: { children: ReactNode }) => (
    <div data-testid="lazy-motion">{children}</div>
  ),
  MotionConfig: ({
    children,
    reducedMotion,
  }: {
    children: ReactNode
    reducedMotion: string
  }) => (
    <div data-testid="motion-config" data-reduced-motion={reducedMotion}>
      {children}
    </div>
  ),
}))

describe('MotionProvider', () => {
  it('OSのreduced-motion設定をmotionコンポーネントへ反映する', () => {
    render(
      <MotionProvider>
        <span>content</span>
      </MotionProvider>
    )

    expect(screen.getByTestId('lazy-motion')).toBeInTheDocument()
    expect(screen.getByTestId('motion-config')).toHaveAttribute(
      'data-reduced-motion',
      'user'
    )
  })
})
