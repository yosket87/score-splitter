import { test, expect } from '@playwright/test'

test.describe('ウェイトリストLP', () => {
  test('未ログインでLPを表示し、シミュレーターと登録が動作する', async ({ page }) => {
    await page.goto('/lp')

    // 未認証でも/loginにリダイレクトされない
    await expect(page).toHaveURL(/\/lp$/)
    await expect(
      page.getByRole('heading', {
        name: 'ふたりの収入から、ふたりの経費を引いて、残りを山分け。',
      })
    ).toBeVisible()

    // シミュレーター
    await page.getByLabel('あなたの月収').fill('300000')
    await page.getByLabel('パートナーの月収').fill('200000')
    await page.getByLabel('共通経費').fill('180000')
    await expect(page.getByText('¥40,000')).toBeVisible()
    await expect(page.getByText('パートナー → あなた')).toBeVisible()

    // 登録フォーム
    await page.getByLabel('メールアドレス').fill('couple@example.com')
    await page.getByLabel('月380円でも使いたい').check()
    await page.getByRole('button', { name: 'ウェイトリストに登録' }).click()
    await expect(
      page.getByText('登録ありがとうございます。準備ができたらご連絡します。')
    ).toBeVisible()
  })
})
