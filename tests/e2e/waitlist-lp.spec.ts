import { test, expect } from '@playwright/test'
import { resetMockData } from './helpers'

test.describe('ウェイトリストLP', () => {
  test.beforeEach(async ({ request }) => {
    await resetMockData(request)
  })

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
    // フロー図のaria-label（「…共通経費18万円を…」）と部分一致しないよう厳密一致で指定
    await page.getByLabel('共通経費', { exact: true }).fill('180000')
    const simulator = page
      .locator('section')
      .filter({ hasText: 'ふたりの精算額を試してみる' })
    await expect(simulator.getByText('¥40,000')).toBeVisible()
    await expect(simulator.getByText('パートナー → あなた')).toBeVisible()

    // 下部登録フォーム
    const signup = page.locator('#signup')
    await signup.getByLabel('メールアドレス').fill('couple@example.com')
    await signup.getByLabel('月380円でも使いたい').check()
    await signup.getByRole('button', { name: 'ウェイトリストに登録' }).click()
    await expect(
      signup.getByText('登録ありがとうございます。準備ができたらご連絡します。')
    ).toBeVisible()
  })

  test('ヒーロー内フォームから登録できる', async ({ page }) => {
    await page.goto('/lp')

    const hero = page.locator('section').first()
    await expect(hero.getByText('公開時に優先案内を受け取る')).toBeVisible()
    await hero.getByLabel('メールアドレス').fill('hero@example.com')
    await hero.getByLabel('無料なら使いたい').check()
    await hero.getByRole('button', { name: 'ウェイトリストに登録' }).click()

    await expect(
      hero.getByText('登録ありがとうございます。準備ができたらご連絡します。')
    ).toBeVisible()
  })
})
