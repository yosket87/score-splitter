import { test, expect, type Page } from '@playwright/test'
import { resetMockData } from './helpers'

const MOCK_PASSWORD = 'password'

test.beforeEach(async ({ request }) => {
  await resetMockData(request)
})

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('パスワード').fill(MOCK_PASSWORD)
  await page.getByRole('button', { name: 'ログイン →' }).click()
  await page.waitForURL(/\/\d{4}\/\d{2}/)
}

test.describe('prefers-reduced-motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('全要素の transition-duration が 0.01ms 以下', async ({ page }) => {
    await login(page)
    await page.goto('/2026/02')

    const hasLongTransition = await page.evaluate(() => {
      const all = document.querySelectorAll('*')
      for (const el of all) {
        const style = getComputedStyle(el)
        const duration = parseFloat(style.transitionDuration)
        if (duration > 0.01) return true
      }
      return false
    })

    expect(hasLongTransition).toBe(false)
  })

  test('全要素の animation-duration が 0.01ms 以下', async ({ page }) => {
    await login(page)
    await page.goto('/2026/02')

    const hasLongAnimation = await page.evaluate(() => {
      const all = document.querySelectorAll('*')
      for (const el of all) {
        const style = getComputedStyle(el)
        const duration = parseFloat(style.animationDuration)
        if (duration > 0.01) return true
      }
      return false
    })

    expect(hasLongAnimation).toBe(false)
  })
})

test.describe('スキップリンク', () => {
  test('スキップリンクがフォーカス可能で表示される', async ({ page }) => {
    await login(page)

    const skipLink = page.locator('a[href="#main"]')
    await expect(skipLink).toBeAttached()

    await skipLink.focus()
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeVisible()
  })

  test('フォーカス時に Enter で main に遷移する', async ({ page }) => {
    await login(page)

    const skipLink = page.locator('a[href="#main"]')
    await skipLink.focus()
    await page.keyboard.press('Enter')

    const mainId = await page.evaluate(() => document.activeElement?.id ?? '')
    expect(mainId).toBe('main')
  })

  test('ログインページでもスキップリンクが機能する', async ({ page }) => {
    await page.goto('/login')

    const skipLink = page.locator('a[href="#main"]')
    await expect(skipLink).toBeAttached()
  })
})
