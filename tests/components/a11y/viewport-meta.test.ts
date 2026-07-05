import { describe, it, expect, vi } from 'vitest'

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

vi.mock('@/components/providers/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/app/globals.css', () => ({}))

import { viewport } from '@/app/layout'

describe('viewport export', () => {
  it('themeColor にライトとダーク両方を定義している', () => {
    expect(viewport.themeColor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ media: '(prefers-color-scheme: light)' }),
        expect.objectContaining({ media: '(prefers-color-scheme: dark)' }),
      ])
    )
  })
})
