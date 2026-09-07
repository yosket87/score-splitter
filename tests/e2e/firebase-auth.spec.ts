import { test, expect } from '@playwright/test'
import { resetMockData } from './helpers'

test.skip(process.env.FIREBASE_AUTH_MOCK !== 'true', 'Firebase専用のローカルモック起動で実行する')
test.beforeEach(async ({ request }) => resetMockData(request))

test('Googleで参加しAppleを明示連携、同じ家計を開く', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Appleでログイン' })).toBeVisible()
  await page.getByRole('button', { name: 'Googleでログイン' }).click()
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
  await page.goto('/2026/02')
  await expect(page.getByRole('heading', { name: '収入', exact: true })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Appleを連携' })).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Appleを連携' }).click()
  await expect(page.getByText('ローカル検証用の連携を確認しました。')).toBeVisible()
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('button', { name: 'Appleでログイン' }).click()
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
  await page.goto('/settings')
  await expect(page.getByText('firebase.local-layout-test@example.com')).toBeVisible()
  expect(await page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)
})

test('全端末ログアウトは他のブラウザのセッションも失効する', async ({ page, browser }) => {
  const context = await browser.newContext()
  try {
    const other = await context.newPage()
    for (const current of [page, other]) {
      await current.goto('http://localhost:3000/login')
      await current.getByRole('button', { name: 'Googleでログイン' }).click()
      await expect(current).toHaveURL(/\/\d{4}\/\d{2}/)
    }
    await page.goto('/settings')
    await page.getByRole('button', { name: '自分のすべての端末からログアウト' }).click()
    await page.getByRole('button', { name: 'ログアウトする', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await other.goto('http://localhost:3000/settings')
    await expect(other).toHaveURL(/\/login$/)
  } finally { await context.close() }
})

test('未知UIDには家計を表示せず照合コードを案内する', async ({ page }) => {
  expect((await page.request.post('/api/mock/firebase/prepare', { data: { scenario: 'pending-a' } })).ok()).toBe(true)
  await page.goto('/login')
  await page.getByRole('button', { name: 'Googleでログイン' }).click()
  await expect(page).toHaveURL(/\/auth\/migration$/)
  await expect(page.getByTestId('migration-code')).toHaveText(/^[a-f0-9]{64}$/)
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/login$/)
})
