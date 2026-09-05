import { expect, test } from '@playwright/test'
import { login, resetMockData } from './helpers'

test.beforeEach(async ({ request }) => { await resetMockData(request) })

test('旧未確認操作の金額を表示せず結果照会だけを提供する', async ({ page }, testInfo) => {
  await login(page)
  await page.evaluate(() => sessionStorage.setItem('payment-operation:202602', JSON.stringify({
    kind: 'record', input: { month: '202602', operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', confirmedSignedYen: 99999999 },
  })))
  await page.goto('/2026/02')
  const panel = page.getByRole('region', { name: '振込状況' })
  await expect(panel.getByText('以前の記録の結果が未確認です。振込記録と照らし合わせて確認してください。')).toBeVisible()
  await expect(panel.getByRole('button', { name: '同じ内容で再送' })).toHaveCount(0)
  await expect(panel).not.toContainText('99,999,999')
  await panel.getByRole('button', { name: '結果を確認' }).click()
  await expect(panel.getByRole('alert')).toContainText('このログインでは記録を確認できませんでした')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('¥15,500')
  await page.screenshot({ path: testInfo.outputPath('previous-result.png'), fullPage: true, animations: 'disabled', style: 'nextjs-portal { display: none !important; }' })
  const keys = await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('payment-operation:')))
  expect(keys).toEqual(['payment-operation:202602'])
})

test('空月に最小金額を追加して1円の確認を表示する', async ({ page }, testInfo) => {
  await login(page)
  await page.goto('/2026/03')
  await page.locator('[data-section="income"]').getByRole('button', { name: '項目を追加' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('項目名', { exact: true }).fill('境界値の収入')
  await form.getByLabel('金額', { exact: true }).fill('2')
  await form.getByRole('radio', { name: '夫', exact: true }).click()
  await form.getByRole('button', { name: /収入.*追加/ }).click()
  await expect(form).not.toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('¥1')
  await page.getByRole('region', { name: '振込状況' }).getByRole('button', { name: '振込済みにする', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '振込内容の確認' })
  await expect(confirm).toContainText('夫 → 妻 1円')
  await page.screenshot({ path: testInfo.outputPath('one-yen.png'), fullPage: true, animations: 'disabled', style: 'nextjs-portal { display: none !important; }' })
})
