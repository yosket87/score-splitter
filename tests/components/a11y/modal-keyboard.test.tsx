import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDrawerViewport } from '@/hooks/use-drawer-viewport'
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
  Object.defineProperty(viewport, 'offsetTop', { value: 0 })
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
  expect(dialog.style.bottom).toBe('calc(100dvh - 667px)')
  expect(screen.getByRole('button', { name: '更新' })).toBeEnabled()
})

it('Safariのキーボード表示と表示領域の移動に高さ・下端を追従する', () => {
  const viewport = new EventTarget()
  let height = 547
  let offsetTop = 0
  Object.defineProperties(viewport, {
    height: { get: () => height },
    offsetTop: { get: () => offsetTop },
  })
  vi.stubGlobal('visualViewport', viewport)
  const { rerender } = render(
    <ResponsiveModal open onOpenChange={() => {}} trigger={null}
      title="支出を編集" description="支出の内容を編集します。">
      <label>金額<input type="number" /></label>
    </ResponsiveModal>
  )
  const dialog = screen.getByRole('dialog')
  act(() => {
    height = 364
    viewport.dispatchEvent(new Event('resize'))
  })
  expect(dialog.style.bottom).toBe('calc(100dvh - 364px)')
  act(() => {
    offsetTop = 96
    viewport.dispatchEvent(new Event('scroll'))
  })
  expect(dialog.style.bottom).toBe('calc(100dvh - 460px)')
  act(() => {
    height = 547
    offsetTop = 0
    viewport.dispatchEvent(new Event('resize'))
  })
  expect(dialog.style.bottom).toBe('calc(100dvh - 547px)')
  const removeListener = vi.spyOn(viewport, 'removeEventListener')
  rerender(<ResponsiveModal open={false} onOpenChange={() => {}} trigger={null}
    title="支出を編集" description="支出の内容を編集します。">閉じた状態</ResponsiveModal>)
  expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function))
})

it('visualViewportがない環境でもCSSの高さ上限で開閉できる', () => {
  vi.stubGlobal('visualViewport', undefined)
  render(<ResponsiveModal open onOpenChange={() => {}} trigger={null}
    title="支出を編集" description="支出の内容を編集します。">本文</ResponsiveModal>)
  const dialog = screen.getByRole('dialog')
  expect(dialog.style.bottom).toBe('')
  expect(dialog.className).toContain('max-h-[80vh]')
})

it('従来の80vh上限を保ち、閉じる途中は最後の補正を保持して再開前に読み直す', () => {
  const viewport = new EventTarget()
  let height = 547
  let offsetTop = 0
  Object.defineProperties(viewport, {
    height: { get: () => height }, offsetTop: { get: () => offsetTop },
  })
  vi.stubGlobal('visualViewport', viewport)
  const { result, rerender } = renderHook(({ open }) => useDrawerViewport(open), { initialProps: { open: true } })
  expect(result.current?.maxHeight).toBe('min(80vh, 547px)')
  act(() => {
    height = 364
    offsetTop = 96
    viewport.dispatchEvent(new Event('resize'))
  })
  const closingStyle = result.current
  rerender({ open: false })
  expect(result.current).toEqual(closingStyle)
  act(() => {
    height = 547
    offsetTop = 0
    viewport.dispatchEvent(new Event('resize'))
  })
  expect(result.current).toEqual(closingStyle)
  rerender({ open: true })
  expect(result.current?.maxHeight).toBe('min(80vh, 547px)')
  expect(result.current?.bottom).toBe('calc(100dvh - 547px)')
})
