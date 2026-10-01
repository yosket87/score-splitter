import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResponsiveModal } from '@/components/ui/responsive-modal'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: () => true }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('複数段階のキーボードresizeとblur後も縮小した高さを残さない', () => {
  const viewport = new EventTarget()
  let height = 667
  Object.defineProperty(viewport, 'height', { get: () => height })
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('innerHeight', 667)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 504, width: 375, top: 163, bottom: 667,
    left: 0, right: 375, x: 0, y: 163, toJSON: () => ({}),
  })

  render(
    <ResponsiveModal open onOpenChange={() => {}} trigger={null}
      title="支出を編集" description="支出の内容を編集します。">
      <label>金額<input type="number" /></label>
      <button type="submit">更新</button>
    </ResponsiveModal>
  )
  const dialog = screen.getByRole('dialog')
  const amount = screen.getByLabelText('金額')
  act(() => amount.focus())
  fireEvent.change(amount, { target: { value: '12345' } })
  for (const nextHeight of [587, 367]) {
    act(() => {
      height = nextHeight
      viewport.dispatchEvent(new Event('resize'))
    })
  }
  act(() => {
    amount.blur()
    height = 667
    viewport.dispatchEvent(new Event('resize'))
  })

  expect(dialog.style.height).toBe('')
  expect(dialog.style.bottom).toBe('')
  expect(screen.getByRole('button', { name: '更新' })).toBeEnabled()
})
