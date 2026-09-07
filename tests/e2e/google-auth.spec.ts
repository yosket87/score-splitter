import { test, expect, type Page } from '@playwright/test'
import { resetMockData } from './helpers'
async function prepare(page: Page, scenario: string) {
  expect((await page.request.post('/api/mock/google/prepare', { data: { scenario } })).ok()).toBe(true)
}
async function googleLogin(page: Page, scenario: string) {
  await prepare(page, scenario)
  await page.goto('/login')
  await page.getByRole('link', { name: 'Googleでログイン', exact: true }).click()
}
test.beforeEach(async ({ request }) => resetMockData(request))
test('Googleでログインし連携状態を表示する', async ({ page }) => {
  await googleLogin(page, 'member-a')
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
  await page.goto('/settings')
  await expect(page.getByText('a.very-long-account-name-for-layout@example.com', { exact: true })).toBeVisible()
})
test('未承認の申請から照合と再ログインを経て家計へ参加する', async ({ page }) => {
  await googleLogin(page, 'pending-a')
  await expect(page.getByRole('heading', { name: '家計への参加を確認しています' })).toBeVisible()
  await expect(page.getByTestId('migration-code')).toHaveText(/^[a-f0-9]{64}$/)
  await prepare(page, 'approve-pending')
  await page.getByRole('link', { name: 'Googleでログイン', exact: true }).click()
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
})
test('本人の全端末だけ失効しパートナーは家計を使い続ける', async ({ page, browser }) => {
  const a2Context = await browser.newContext(), bContext = await browser.newContext()
  const a2 = await a2Context.newPage(), b = await bContext.newPage()
  try {
    await googleLogin(page, 'member-a'); await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
    await googleLogin(a2, 'member-a'); await expect(a2).toHaveURL(/\/\d{4}\/\d{2}/)
    await googleLogin(b, 'member-b'); await expect(b).toHaveURL(/\/\d{4}\/\d{2}/)
    const oldCookie = (await a2Context.cookies()).find(cookie => cookie.name === 'household_session')!.value
    await page.goto('/settings')
    await page.getByRole('button', { name: '自分のすべての端末からログアウト' }).click()
    await page.getByRole('button', { name: 'ログアウトする', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await a2.goto('/settings'); await expect(a2).toHaveURL(/\/login$/)
    expect((await a2Context.cookies()).find(cookie => cookie.name === 'household_session')!.value).toBe(oldCookie)
    await b.goto('/2026/02'); await expect(b.getByText('収入', { exact: true }).first()).toBeVisible()
  } finally { await a2Context.close(); await bContext.close() }
})
test('復旧完了は新しいGoogleログインを案内する', async ({ page }) => {
  await googleLogin(page, 'recovery')
  await expect(page).toHaveURL(/\/auth\/migration$/)
  await prepare(page, 'approve-recovery')
  await page.getByRole('link', { name: 'Googleでログイン', exact: true }).click()
  await expect(page.getByText('アカウントを復旧しました。Googleでログインし直してください。')).toBeVisible()
  await page.getByRole('link', { name: 'Googleでログイン', exact: true }).click()
  await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
})
test('キャンセル・申請期限切れ・Cookieなしでは家計情報を出さない', async ({ page, browser }) => {
  await googleLogin(page, 'cancel')
  await expect(page.getByText('Googleログインをキャンセルしました。')).toBeVisible()
  await googleLogin(page, 'pending-a')
  await prepare(page, 'expire-pending'); await page.reload()
  await expect(page.getByRole('heading', { name: 'もう一度ログインしてください' })).toBeVisible()
  const context = await browser.newContext()
  try {
    const fresh = await context.newPage(); await fresh.goto('/auth/migration')
    await expect(fresh.getByRole('heading', { name: 'もう一度ログインしてください' })).toBeVisible()
    await expect(fresh.getByTestId('migration-code')).toHaveCount(0)
  } finally { await context.close() }
})
