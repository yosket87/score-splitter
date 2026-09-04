import { expect, test, type Page } from '@playwright/test'
import { login, resetMockData } from './helpers'

async function openBreakdown(page: Page) {
  const trigger = page.getByRole('button', { name: '精算の内訳' })
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

test.beforeEach(async ({ request }) => {
  await resetMockData(request)
})

test('開閉で精算額を変えず、月移動後は新しい月の内訳を表示する', async ({ page }) => {
  await login(page)
  await page.goto('/2026/02')
  const hero = page.getByRole('heading', { level: 1 })
  const trigger = page.getByRole('button', { name: '精算の内訳' })
  await expect(hero).toHaveAccessibleName('精算額 ¥15,500 夫 → 妻')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: '夫の内訳' })).toContainText('¥253,000')
  await expect(hero).toHaveAccessibleName('精算額 ¥15,500 夫 → 妻')
  await page.keyboard.press('Space')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(hero).toHaveAccessibleName('精算額 ¥15,500 夫 → 妻')
  await trigger.click()
  await page.getByRole('button', { name: '前月に移動' }).click()
  await expect(page).toHaveURL(/\/2026\/01$/)
  await openBreakdown(page)
  await expect(page.getByRole('region', { name: '夫の内訳' }).getByRole('definition')).toHaveText([
    '¥350,000', '−¥120,000', '¥230,000',
  ])
  await expect(hero).toHaveAccessibleName('精算額 ¥3,500 夫 → 妻')
  await page.getByRole('button', { name: '翌月に移動' }).click()
  await expect(page).toHaveURL(/\/2026\/02$/)
  await openBreakdown(page)
  await expect(page.getByRole('region', { name: '夫の内訳' })).toContainText('¥253,000')
})

for (const width of [375, 1280]) {
  for (const theme of ['ライト', 'ダーク'] as const) {
    test(`${width}px・${theme}で通常・空・長い数値の表示を検証する`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await login(page)
      await page.goto('/2026/02')
      await page.getByRole('button', { name: 'テーマを切り替え' }).click()
      await page.getByRole('menuitem', { name: theme, exact: true }).click()
      await expect(page.locator('html')).toHaveClass(theme === 'ダーク' ? /dark/ : /light/)

      async function capture(name: string, heroAmount: string) {
        await openBreakdown(page)
        // 金額のカウントアップ完了を待ち、途中の値を証跡に残さない。
        await expect(page.getByRole('heading', { level: 1 })).toContainText(heroAmount)
        const trigger = page.getByRole('button', { name: '精算の内訳' })
        expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBe(0)
        const husband = page.getByRole('region', { name: '夫の内訳' })
        const wife = page.getByRole('region', { name: '妻の内訳' })
        for (const person of [husband, wife]) {
          expect(await person.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
        }
        await expect(page.getByRole('img', { name: /直近.*収入と支出の推移グラフ/ })).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: 'disabled' })
        await trigger.click()
        await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      }

      await capture('normal', '¥15,500')
      await page.goto('/2026/03')
      await openBreakdown(page)
      await expect(page.getByText('精算不要', { exact: true })).toBeVisible()
      await capture('empty', '精算なし')

      if (width < 768) {
        await page.getByRole('button', { name: '項目を追加', exact: true }).click()
      } else {
        await page.locator('[data-section="income"]').getByRole('button', { name: '項目を追加' }).click()
      }
      const dialog = page.getByRole('dialog')
      if (width < 768) await dialog.getByRole('radio', { name: '収入', exact: true }).click()
      await dialog.getByLabel('項目名', { exact: true }).fill('境界値の収入')
      await dialog.getByLabel('金額', { exact: true }).fill('999999999')
      await dialog.getByRole('radio', { name: '夫', exact: true }).click()
      await dialog.getByRole('button', { name: width < 768 ? '保存' : /収入.*追加/ }).click()
      await expect(dialog).not.toBeVisible()
      await openBreakdown(page)
      await expect(page.getByRole('region', { name: '夫の内訳' })).toContainText('¥999,999,999')
      await expect(page.getByText('¥499,999,999.5', { exact: true })).toHaveCount(2)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('精算額 ¥499,999,999 夫 → 妻')
      await capture('long-fraction', '¥499,999,999')
    })
  }
}
