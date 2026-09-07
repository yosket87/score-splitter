import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
vi.mock('@/lib/auth/firebase-config', () => ({ firebaseAuthConfig: () => null }))
vi.mock('@/features/firebase-auth/firebase-session-sync', () => ({ FirebaseSessionSync: () => null }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

vi.mock('@/components/providers/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/app/globals.css', () => ({}))

import RootLayout from '@/app/layout'

describe('スキップリンク', () => {
  it('href="#main" のスキップリンクが存在する', async () => {
    const { container } = render(
      await RootLayout({ children: <main id="main" tabIndex={-1}>コンテンツ</main> })
    )

    const skipLink = container.querySelector('a[href="#main"]')
    expect(skipLink).toBeTruthy()
    expect(skipLink?.textContent).toBe('メインコンテンツへ')
  })

  it('main 要素が tabIndex={-1} でフォーカス可能である', async () => {
    const { container } = render(
      await RootLayout({ children: <main id="main" tabIndex={-1}>コンテンツ</main> })
    )

    const main = container.querySelector('main#main')
    expect(main).toBeTruthy()
    expect(main?.getAttribute('tabindex')).toBe('-1')
  })
})
