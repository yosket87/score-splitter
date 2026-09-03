import { test, expect, type Locator, type Page } from '@playwright/test'
import { resetMockData } from './helpers'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page, request }) => {
  await resetMockData(request)
  await page.goto('/login')
  await page.getByPlaceholder('パスワード').fill('password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(/\/\d{4}\/\d{2}/)
  await page.goto('/2026/02')
})

function expenseRow(page: Page, label: string) {
  return page.locator('[data-section="expense"] [data-testid="item-row"]').filter({ hasText: label })
}

async function expectMobileLayout(row: Locator) {
  await expect.poll(async () => row.evaluate((element) => {
    const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect()
    const person = rect('[data-slot="entry-person"]')
    const label = rect('[data-slot="entry-label"]')
    const amount = rect('[data-slot="entry-amount"]')
    const menu = rect('button[aria-haspopup="menu"]')
    const center = (box: DOMRect) => box.y + box.height / 2
    const contentCenter = (label.top + amount.bottom) / 2
    return {
      labelAboveAmount: label.bottom <= amount.top,
      personOnLeft: person.right < label.left,
      menuOnRight: amount.right < menu.left,
      personCentered: Math.abs(center(person) - contentCenter) < 1,
      menuCentered: Math.abs(center(menu) - contentCenter) < 1,
      sameColumn: Math.abs(label.right - amount.right) < 1,
      touchTarget: menu.width >= 48 && menu.height >= 48,
      labelNotClipped: element.querySelector('[data-slot="entry-label"]')!.scrollWidth <= label.width + 1,
    }
  })).toEqual({
    labelAboveAmount: true, personOnLeft: true, menuOnRight: true,
    personCentered: true, menuCentered: true, sameColumn: true, touchTarget: true, labelNotClipped: true,
  })
}

test('スマホ幅では3列・2段に揃い、追加ボタンは1つだけ表示される', async ({ page }) => {
  for (const width of [320, 390, 767]) {
    await page.setViewportSize({ width, height: 844 })
    for (const section of ['income', 'expense', 'carryover']) {
      const row = page.locator(`[data-section="${section}"] [data-testid="item-row"]`).first()
      await expect(row.getByRole('button', { name: /のメニュー$/ })).toBeVisible()
      await expectMobileLayout(row)
    }
    await expect(page.getByRole('button', { name: '項目を追加', exact: true })).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
})

test('長い名前と大きな金額を編集でき、メニューから繰越と削除を操作できる', async ({ page }) => {
  // 共通のシード項目を削除せず、このテスト専用の項目で操作する。
  await page.getByRole('button', { name: '項目を追加', exact: true }).click()
  const addDialog = page.getByRole('dialog', { name: '項目を追加' })
  await addDialog.getByLabel('項目名', { exact: true }).fill('編集テスト用の支出')
  await addDialog.getByLabel('金額', { exact: true }).fill('120000')
  await addDialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(addDialog).not.toBeVisible()
  const row = expenseRow(page, '編集テスト用の支出')
  await row.getByRole('button', { name: '編集テスト用の支出のメニュー' }).click()
  await page.getByRole('menuitem', { name: '編集', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '支出を編集' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(dialog).toBeFocused()
  // バリデーション上限の255文字でも名前全体が読めることを確認する。
  const longLabel = '住宅ローン・管理費・修繕積立金'.repeat(20).slice(0, 255)
  await dialog.getByLabel('項目名', { exact: true }).fill(longLabel)
  await dialog.getByLabel('金額', { exact: true }).fill('999999999')
  await dialog.getByRole('button', { name: '更新', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  const updatedRow = expenseRow(page, longLabel)
  await expect(updatedRow).toContainText('−¥999,999,999')
  await page.setViewportSize({ width: 320, height: 844 })
  await expectMobileLayout(updatedRow)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await updatedRow.getByRole('button', { name: `${longLabel}のメニュー` }).click()
  await page.getByRole('menuitem', { name: '繰越にする' }).click()
  await expect(updatedRow.getByText('繰越', { exact: true })).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(0)

  await updatedRow.getByRole('button', { name: `${longLabel}のメニュー` }).click()
  await page.getByRole('menuitem', { name: '削除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click()
  await expect(updatedRow.getByRole('button', { name: `${longLabel}のメニュー` })).toBeFocused()
  await updatedRow.getByRole('button', { name: `${longLabel}のメニュー` }).click()
  await page.getByRole('menuitem', { name: '削除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click()
  await expect(updatedRow).toHaveCount(0)
})

test('繰越の清算を切り替えられ、編集をキャンセルすると保存値に戻る', async ({ page }) => {
  const row = page.locator('[data-section="carryover"] [data-testid="item-row"]').first()
  await row.getByRole('button', { name: '前月繰越のメニュー' }).click()
  await page.getByRole('menuitem', { name: '清算する' }).click()
  await expect(row.getByText('清算済', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: '前月繰越のメニュー' }).click()
  await page.getByRole('menuitem', { name: '編集', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '繰越を編集' })
  await dialog.getByRole('radio', { name: '妻' }).click()
  await dialog.getByRole('button', { name: 'キャンセル' }).click()
  await row.getByRole('button', { name: '前月繰越のメニュー' }).click()
  await page.getByRole('menuitem', { name: '編集', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: '夫' })).toHaveAttribute('aria-checked', 'true')
  await dialog.getByRole('button', { name: 'キャンセル' }).click()
  await row.getByRole('button', { name: '前月繰越のメニュー' }).click()
  await page.getByRole('menuitem', { name: '清算を取消' }).click()
  await expect(row.getByText('清算済', { exact: true })).toHaveCount(0)
})

test('空の月から追加でき、最終行が固定の追加バーに隠れない', async ({ page }) => {
  await page.goto('/2026/12')
  await expect(page.getByText('収入がありません')).toBeVisible()
  await expect(page.getByText('支出がありません')).toBeVisible()
  await expect(page.getByText('繰越がありません')).toBeVisible()
  await page.getByRole('button', { name: '項目を追加', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '項目を追加' })
  await dialog.getByRole('radio', { name: '繰越', exact: true }).click()
  await dialog.getByLabel('項目名', { exact: true }).fill('翌月の生活費')
  await dialog.getByLabel('金額', { exact: true }).fill('1')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  const row = page.locator('[data-section="carryover"] [data-testid="item-row"]')
  await expect(row).toContainText('翌月の生活費')
  await expectMobileLayout(row)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(async () => {
    const itemBox = await row.boundingBox()
    const barBox = await page.locator('[data-slot="entry-add-bar"]').boundingBox()
    return itemBox!.y + itemBox!.height <= barBox!.y
  }).toBe(true)
})

test('768px以上では従来の1段表示と直接の編集・削除ボタンを維持する', async ({ page }) => {
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const row = expenseRow(page, '家賃')
    await expect(row.getByRole('button', { name: '家賃のメニュー' })).toHaveCount(0)
    await expect(row.getByRole('button', { name: '家賃を編集' })).toBeAttached()
    await expect(row.getByRole('button', { name: '家賃を削除' })).toBeAttached()
    const label = await row.locator('[data-slot="entry-label"]').boundingBox()
    const amount = await row.locator('[data-slot="entry-amount"]').boundingBox()
    expect(Math.abs(label!.y + label!.height / 2 - amount!.y - amount!.height / 2)).toBeLessThan(1)
    await expect(page.locator('[data-slot="entry-add-bar"]')).not.toBeVisible()
    await expect(page.getByRole('button', { name: '項目を追加', exact: true })).toHaveCount(3)
  }
})
