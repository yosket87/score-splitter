import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

vi.mock('@/components/providers/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/app/globals.css', () => ({}))

import RootLayout from '@/app/layout'

describe('スキップリンク', () => {
  it('href="#main" のスキップリンクが存在する', () => {
    const { container } = render(
      <RootLayout>
        <main id="main" tabIndex={-1}>コンテンツ</main>
      </RootLayout>
    )

    const skipLink = container.querySelector('a[href="#main"]')
    expect(skipLink).toBeTruthy()
    expect(skipLink?.textContent).toBe('メインコンテンツへ')
  })

  it('main 要素が tabIndex={-1} でフォーカス可能である', () => {
    const { container } = render(
      <RootLayout>
        <main id="main" tabIndex={-1}>コンテンツ</main>
      </RootLayout>
    )

    const main = container.querySelector('main#main')
    expect(main).toBeTruthy()
    expect(main?.getAttribute('tabindex')).toBe('-1')
  })
})
