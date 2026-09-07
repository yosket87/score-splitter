import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/auth/firebase-config', () => ({ firebaseAuthConfig: () => null }))
vi.mock('@/features/firebase-auth/firebase-session-sync', () => ({ FirebaseSessionSync: () => null }))

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

  it('themeColorをアプリのアンビエント背景色に揃える', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#F4F7FC' },
      { media: '(prefers-color-scheme: dark)', color: '#0B0E14' },
    ])
  })
})
