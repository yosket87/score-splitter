import { test, expect } from '@playwright/test'
import { resetMockData } from './helpers'

test.beforeEach(async ({ page, request }) => {
  await resetMockData(request)
  await page.goto('/login')
  await page.getByPlaceholder('パスワード').fill('password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(/\/\d{4}\/\d{2}/)
})

test('繰越確認fingerprintを伴うコピーを空の対象月へ反映する', async ({ page }, testInfo) => {
  await page.goto('/2026/03')
  await expect(page.locator('[data-section="income"]').getByText('収入がありません')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('empty-target.png'), fullPage: true })
  await page.getByRole('button', { name: /前月からコピー/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('給料').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('preview.png'), fullPage: true })
  await dialog.getByRole('button', { name: /コピーする/ }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-section="carryover"]').getByText('前月繰越')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('copied.png'), fullPage: true })
})

test('コピー元が空でもプレビューを取得してキャンセルできる', async ({ page }, testInfo) => {
  await page.goto('/2027/02')
  await page.getByRole('button', { name: /前月からコピー/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('前月からデータをコピー')).toBeVisible()
  await expect(dialog.getByText('コピー元の月にデータがありません')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('empty-source.png'), fullPage: true })
  await dialog.getByRole('button', { name: 'キャンセル' }).click()
  await expect(dialog).not.toBeVisible()
})
