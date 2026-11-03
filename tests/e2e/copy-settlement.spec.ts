import { expect, test } from '@playwright/test'
import { login, resetMockData } from './helpers'

test('振込額を数字だけでコピーし、月移動後はその月の額をコピーする', async ({ page, context, request }) => {
  await resetMockData(request)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 375, height: 900 })
  await login(page)
  await page.goto('/2026/02')
  const copy = page.getByRole('button', { name: '振込額をコピー' })
  await copy.click()
  await expect(page.getByText('振込額をコピーしました', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('15500')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('¥15,500')
  await page.screenshot({ path: 'test-results/copy-settlement.png', fullPage: true, animations: 'disabled' })

  await page.getByRole('button', { name: '前月に移動' }).click()
  await expect(page).toHaveURL(/\/2026\/01$/)
  await copy.click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('3500')

  await page.goto('/2026/03')
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('精算額 精算なし')
  await expect(copy).toHaveCount(0)
  await page.screenshot({ path: 'test-results/copy-settlement-empty.png', fullPage: true, animations: 'disabled' })
})
