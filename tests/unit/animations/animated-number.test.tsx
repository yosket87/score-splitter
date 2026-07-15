import { render, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimatedYen } from '@/components/animations/animated-number'

vi.mock('@/components/animations/use-motion-prefs', () => ({
  useMotionPrefs: () => ({ reduced: true, instant: { duration: 0 } }),
}))

afterEach(() => {
  cleanup()
})

describe('AnimatedYen', () => {
  it('reduced-motion時に正の値を即時表示する', async () => {
    const { container } = render(<AnimatedYen value={1234} />)
    await waitFor(() => {
      expect(container.textContent).toBe('¥1,234')
    })
  })

  it('reduced-motion時に負の値をマイナス付きで表示する', async () => {
    const { container } = render(<AnimatedYen value={-500} />)
    await waitFor(() => {
      expect(container.textContent).toBe('−¥500')
    })
  })

  it('absoluteプロップ指定時に絶対値を表示する', async () => {
    const { container } = render(<AnimatedYen value={-500} absolute />)
    await waitFor(() => {
      expect(container.textContent).toBe('¥500')
    })
  })

  it('ゼロを正しくレンダリングする', async () => {
    const { container } = render(<AnimatedYen value={0} />)
    await waitFor(() => {
      expect(container.textContent).toBe('¥0')
    })
  })

  it('小数の金額を共通フォーマットと同じく切り捨てる', async () => {
    const { container } = render(<AnimatedYen value={499999999.5} />)
    await waitFor(() => {
      expect(container.textContent).toBe('¥499,999,999')
    })
  })

  it('value変更後に最終値に到達する', async () => {
    const { container, rerender } = render(<AnimatedYen value={100} />)
    await waitFor(() => {
      expect(container.textContent).toBe('¥100')
    })
    rerender(<AnimatedYen value={9999} />)
    await waitFor(() => {
      expect(container.textContent).toBe('¥9,999')
    })
  })
})
