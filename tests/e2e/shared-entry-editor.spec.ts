import { test, expect, type Locator, type Page } from '@playwright/test'
import { login, resetMockData } from './helpers'

async function openEditor(page: Page, row: Locator, label: string, mobile: boolean) {
  const trigger = row.getByRole('button', { name: `${label}${mobile ? 'のメニュー' : 'を編集'}`, exact: true })
  await trigger.click()
  if (mobile) await page.getByRole('menuitem', { name: '編集', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  return trigger
}

for (const width of [390, 1280]) {
  test(`${width}px: 別行への切り替えと保存後のフォーカスを維持する`, async ({ page, request }, testInfo) => {
    await resetMockData(request)
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page)
    await page.goto('/2026/02')
    await page.getByRole('button', { name: '項目を追加', exact: true }).click()
    const add = page.getByRole('dialog', { name: '項目を追加' })
    await add.getByRole('radio', { name: '繰越', exact: true }).click()
    await add.getByLabel('項目名', { exact: true }).fill('追加繰越')
    await add.getByLabel('金額', { exact: true }).fill('1234')
    await add.getByRole('radio', { name: '妻', exact: true }).click()
    await add.getByRole('button', { name: '保存', exact: true }).click()
    await expect(add).not.toBeVisible()
    await page.setViewportSize({ width, height: 844 })
    const mobile = width < 768

    for (const [section, firstLabel, secondLabel, secondAmount] of [
      ['income', '給料', '給料', '280000'],
      ['expense', '家賃', '食費', '32000'],
      ['carryover', '前月繰越', '追加繰越', '1234'],
    ]) {
      const rows = page.locator(`[data-section="${section}"] [data-testid="item-row"]`)
      const first = rows.filter({ hasText: firstLabel }).first()
      const second = rows.filter({ hasText: secondLabel }).nth(section === 'income' ? 1 : 0)
      const firstTrigger = await openEditor(page, first, firstLabel, mobile)
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('項目名', { exact: true }).fill('未保存')
      await dialog.getByLabel('金額', { exact: true }).fill('1')
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
      await expect(dialog).not.toBeVisible()
      await expect(firstTrigger).toBeFocused()

      await openEditor(page, second, secondLabel, mobile)
      await expect(dialog.getByLabel('項目名', { exact: true })).toHaveValue(secondLabel)
      await expect(dialog.getByLabel('金額', { exact: true })).toHaveValue(secondAmount)
      await expect(dialog.getByRole('radio', { name: '妻', exact: true })).toHaveAttribute('aria-checked', 'true')
      if (section === 'expense') {
        // 撮影時だけ、変換行列の文字列表現に依存せず終了を待つ。
        await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))))
        await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`) })
      }
      const updatedLabel = `${section}更新`
      await dialog.getByLabel('項目名', { exact: true }).fill(updatedLabel)
      await dialog.getByLabel('金額', { exact: true }).fill('2')
      await dialog.getByRole('button', { name: '更新', exact: true }).click()
      await expect(dialog).not.toBeVisible()
      const updated = rows.filter({ hasText: updatedLabel })
      await expect(updated).toContainText('¥2')
      await expect(updated.getByRole('button', { name: `${updatedLabel}${mobile ? 'のメニュー' : 'を編集'}`, exact: true })).toBeFocused()
      await expect(first).toContainText(firstLabel)
    }

    await page.goto('/2026/12')
    for (const title of ['収入', '支出', '繰越']) await expect(page.getByText(`${title}がありません`)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`empty-${width}.png`), fullPage: true })
  })

  test(`${width}px: 古い保存応答を受けても別行の編集中の入力を保つ`, async ({ page, request }) => {
    await resetMockData(request)
    await page.setViewportSize({ width, height: 844 })
    await login(page)
    await page.goto('/2026/02')
    let releaseResponse!: () => void
    let notifyResponse!: () => void
    const gate = new Promise<void>((resolve) => { releaseResponse = resolve })
    const responseReady = new Promise<void>((resolve) => { notifyResponse = resolve })
    let intercepted = false
    // ローカルのServer Action応答を1回だけ遅延させ、保存中の編集切り替えを再現する。
    await page.route('**/2026/02', async (route) => {
      if (!intercepted && route.request().method() === 'POST') {
        intercepted = true
        const response = await route.fetch()
        notifyResponse()
        await gate
        await route.fulfill({ response })
      } else {
        await route.continue()
      }
    })
    const rows = page.locator('[data-section="expense"] [data-testid="item-row"]')
    const first = rows.filter({ hasText: '家賃' })
    await openEditor(page, first, '家賃', width < 768)
    const dialog = page.getByRole('dialog', { name: '支出を編集' })
    await dialog.getByLabel('金額', { exact: true }).fill('1')
    await dialog.getByRole('button', { name: '更新', exact: true }).click()
    await responseReady
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await openEditor(page, rows.filter({ hasText: '食費' }), '食費', width < 768)
    await dialog.getByLabel('項目名', { exact: true }).fill('次の編集中')
    releaseResponse()
    await expect(first).toContainText('−¥1')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('項目名', { exact: true })).toHaveValue('次の編集中')
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
    await expect(rows.filter({ hasText: '食費' })).toContainText('−¥32,000')
  })
}
