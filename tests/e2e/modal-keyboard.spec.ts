import { test, expect } from '@playwright/test'
import { login, resetMockData } from './helpers'

test.use({ viewport: { width: 375, height: 667 } })

for (const resizeLayout of [false, true]) {
  test(`数値編集後の高さを復元して更新できる（layout resize: ${resizeLayout}）`, async ({ page, request }) => {
    // ソフトウェアキーボードを扱えないE2Eでは、調査で判明したイベント順序を与える。
    await page.addInitScript(() => {
      const viewport = window.visualViewport!
      let visualHeight = 667
      let layoutHeight = 667
      Object.defineProperty(viewport, 'height', { get: () => visualHeight })
      Object.defineProperty(window, 'innerHeight', { get: () => layoutHeight })
      Object.assign(window, {
        setKeyboardViewport(height: number, innerHeight = 667) {
          visualHeight = height
          layoutHeight = innerHeight
          viewport.dispatchEvent(new Event('resize'))
        },
      })
    })
    await resetMockData(request)
    await login(page)
    await page.goto('/2026/02')
    await page.getByRole('button', { name: '食費のメニュー', exact: true }).click()
    await page.getByRole('menuitem', { name: '編集', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '支出を編集' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toBeFocused()
    // 開くアニメーションが落ち着いた高さを基準にする。
    await expect.poll(() => dialog.evaluate(el => ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(el).transform))).toBe(true)
    const initialHeight = (await dialog.boundingBox())!.height
    const amount = dialog.getByLabel('金額', { exact: true })
    await amount.fill('12345')
    for (const height of [587, 367]) {
      await page.evaluate(({ height, resizeLayout }) => {
        const target = window as typeof window & { setKeyboardViewport: (height: number, innerHeight?: number) => void }
        target.setKeyboardViewport(height, resizeLayout && height === 367 ? height : 667)
      }, { height, resizeLayout })
    }
    await amount.evaluate(el => el.blur())
    await page.evaluate(() => {
      const target = window as typeof window & { setKeyboardViewport: (height: number) => void }
      target.setKeyboardViewport(667)
    })
    await expect.poll(async () => Math.abs((await dialog.boundingBox())!.height - initialHeight)).toBeLessThan(1)
    const update = dialog.getByRole('button', { name: '更新', exact: true })
    await expect(update).toBeInViewport()
    await update.click()
    await expect(dialog).not.toBeVisible()
    const row = page.locator('[data-section="expense"] [data-testid="item-row"]').filter({ hasText: '食費' })
    await expect(row).toContainText('−¥12,345')
  })
}

test('小画面でも本文をスクロールして更新ボタンを押せる', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await resetMockData(request)
  await login(page)
  await page.goto('/2026/02')
  await page.getByRole('button', { name: '食費のメニュー', exact: true }).click()
  await page.getByRole('menuitem', { name: '編集', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '支出を編集' })
  await dialog.getByLabel('金額', { exact: true }).fill('1')
  const update = dialog.getByRole('button', { name: '更新', exact: true })
  // Playwrightのスクロール補助が本文を実際にスクロールできることも確認する。
  await update.click()
  await expect(dialog).not.toBeVisible()
  const row = page.locator('[data-section="expense"] [data-testid="item-row"]').filter({ hasText: '食費' })
  await expect(row).toContainText('−¥1')
})
