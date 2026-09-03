import { expect, test } from '@playwright/test'
import { login, resetMockData } from './helpers'

async function selectTheme(page: import('@playwright/test').Page, theme: 'ライト' | 'ダーク') {
  await page.getByRole('button', { name: 'テーマを切り替え' }).click()
  await page.getByRole('menuitem', { name: theme }).click()
  await expect(page.locator('html')).toHaveClass(theme === 'ダーク' ? /dark/ : /light/)
}

async function updateDiningAmount(page: import('@playwright/test').Page, amount: string) {
  const expenseRow = page
    .locator('[data-section="expense"] [data-testid="item-row"]')
    .filter({ hasText: '外食' })
  await expenseRow.getByRole('button', { name: /外食.*を編集/ }).click()
  const editDialog = page.getByRole('dialog')
  await editDialog.locator('input[name="amount"]').fill(amount)
  await editDialog.getByRole('button', { name: '更新' }).click()
  await expect(editDialog).not.toBeVisible()
}

async function getAiDiagnosisStats(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/api/mock/ai-diagnosis-stats')
  expect(response.ok()).toBe(true)
  return response.json() as Promise<{
    categoryProviderCalls: number
    narrativeProviderCalls: number
    diagnosisSaveCalls: number
  }>
}

test.beforeEach(async ({ request }) => {
  await resetMockData(request)
})

test('4か月データから家庭全体の診断を生成して保存結果を再表示する', async ({
  page,
  request,
}) => {
  await login(page)
  await page.goto('/2026/02')
  await page.waitForLoadState('networkidle')

  const trigger = page.getByRole('button', { name: 'AIで今月を振り返る' })
  await trigger.click()
  await page.getByRole('button', { name: '診断を始める' }).click()

  await expect(page.getByRole('status')).toHaveText('支出を整理しています')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await trigger.click()
  await expect(page.getByRole('status')).toHaveText('過去の傾向と比較しています', {
    timeout: 2_000,
  })
  await expect(page.getByRole('status')).toHaveText('振り返りを作成しています', {
    timeout: 2_000,
  })

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('今月のまとめ')).toBeVisible()
  await expect(dialog.getByText('気になった変化')).toBeVisible()
  await expect(dialog.getByText('良かった点')).toBeVisible()
  await expect(dialog.getByText('来月のヒント')).toBeVisible()
  await expect(dialog.getByText(/過去平均より.*円増/).first()).toBeVisible()
  await expect(dialog.getByText(/夫の支出|妻の支出/)).toHaveCount(0)
  await expect.poll(() => getAiDiagnosisStats(request)).toEqual({
    categoryProviderCalls: 1,
    narrativeProviderCalls: 1,
    diagnosisSaveCalls: 1,
  })

  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'AIで今月を振り返る' }).click()
  const reloadedDialog = page.getByRole('dialog')
  await expect(reloadedDialog.getByText('今月のまとめ')).toBeVisible()
  await expect(page.getByRole('button', { name: '診断を始める' })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('')
  expect(await getAiDiagnosisStats(request)).toEqual({
    categoryProviderCalls: 1,
    narrativeProviderCalls: 1,
    diagnosisSaveCalls: 1,
  })
})

test('支出更新後は保存結果を期限切れ表示し、明示操作で再診断する', async ({ page }) => {
  await login(page)
  await page.goto('/2026/02')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', { name: 'AIで今月を振り返る' })

  await trigger.click()
  const startButton = page.getByRole('button', { name: '診断を始める' })
  await expect(startButton).toBeVisible()
  await startButton.click()
  await expect(page.getByText('今月のまとめ')).toBeVisible()
  await page.keyboard.press('Escape')

  await updateDiningAmount(page, '25000')

  await trigger.click()
  await expect(page.getByText(/家計データが更新されています/)).toBeVisible()
  // 初回実行直後は5秒のクールダウンがあるため、解除後に再実行して確認する。
  await expect(async () => {
    const retryButton = page.getByRole('button', { name: '最新データで再診断' })
    if (await retryButton.isVisible() && await retryButton.isEnabled()) {
      await retryButton.click()
    }
    await expect(page.getByText(/家計データが更新されています/)).not.toBeVisible()
  }).toPass({ intervals: [1000], timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'もう一度診断する' })).toBeVisible()
})

test('実支出0件月は診断起点を無効にして理由を表示する', async ({ page }) => {
  await login(page)
  await page.goto('/2026/03')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('button', { name: 'AIで今月を振り返る' })).toBeDisabled()
  await expect(page.getByText('実支出がある月で利用できます')).toBeVisible()
})

test('1196px幅でAI診断起点が月次要約カード内に収まる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1196, height: 768 })
  await login(page)
  await page.goto('/2026/03')
  await page.waitForLoadState('networkidle')

  const overviewCard = page
    .getByRole('region', { name: '月次要約' })
    .locator('.app-glass-heavy')
  const trigger = page.getByRole('button', { name: 'AIで今月を振り返る' })
  const [cardBox, triggerBox] = await Promise.all([
    overviewCard.boundingBox(),
    trigger.boundingBox(),
  ])

  expect(cardBox).not.toBeNull()
  expect(triggerBox).not.toBeNull()
  expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(
    cardBox!.x + cardBox!.width
  )
  await page.screenshot({
    path: testInfo.outputPath('monthly-overview-actions-1196.png'),
    animations: 'disabled',
  })
})

test('390x844ではDrawerの閉じる操作が44px以上で起点へfocusを戻す', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('/2026/02')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', { name: 'AIで今月を振り返る' })

  expect(await page.evaluate(() => matchMedia('(max-width: 767px)').matches)).toBe(true)
  const triggerBox = await trigger.boundingBox()
  expect(triggerBox?.width).toBeGreaterThanOrEqual(44)
  expect(triggerBox?.height).toBeGreaterThanOrEqual(44)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )
  await trigger.click()
  await expect(page.locator('[data-slot="drawer-content"]')).toBeVisible()
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0)
  const close = page.getByRole('button', { name: '閉じる' })
  const closeBox = await close.boundingBox()
  expect(closeBox?.width).toBeGreaterThanOrEqual(44)
  expect(closeBox?.height).toBeGreaterThanOrEqual(44)
  await close.click()
  await expect(page.locator('[data-slot="drawer-content"]')).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('1440x900ではDialogをEscapeで閉じて起点へフォーカスを戻す', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/2026/02')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', { name: 'AIで今月を振り返る' })

  await trigger.click()
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()
  await expect(page.locator('[data-slot="drawer-content"]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('1440x900と390x844のlight/dark目視証跡を保存する', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await page.goto('/2026/02')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', { name: 'AIで今月を振り返る' })

  await trigger.click()
  const startButton = page.getByRole('button', { name: '診断を始める' })
  await expect(startButton.or(page.getByText('今月のまとめ'))).toBeVisible()
  if (await startButton.isVisible()) await startButton.click()
  const refreshButton = page.getByRole('button', { name: '最新データで再診断' })
  if (await refreshButton.isVisible()) {
    await refreshButton.click()
    await expect(page.getByRole('button', { name: 'もう一度診断する' })).toBeVisible({
      timeout: 10_000,
    })
  }
  const dialog = page.locator('[data-slot="dialog-content"]')
  await expect(dialog.getByText('今月のまとめ')).toBeVisible()
  await page.locator('nextjs-portal').evaluateAll((elements) =>
    elements.forEach((element) => element.remove())
  )
  await page.screenshot({
    path: testInfo.outputPath('desktop-light.png'),
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')
  await selectTheme(page, 'ダーク')
  await trigger.click()
  await expect(dialog.getByText('今月のまとめ')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('desktop-dark.png'),
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')

  await selectTheme(page, 'ライト')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )
  await trigger.click()
  await page.locator('nextjs-portal').evaluateAll((elements) =>
    elements.forEach((element) => element.remove())
  )
  const drawer = page.locator('[data-slot="drawer-content"]')
  await expect(drawer.getByText('今月のまとめ')).toBeVisible()
  const mobileLayout = await drawer.evaluate((element) => {
    const scrollOwners = [...element.querySelectorAll<HTMLElement>('.overflow-y-auto')]
    return {
      ownerCount: scrollOwners.length,
      overscrollBehaviorY: getComputedStyle(scrollOwners[0]).overscrollBehaviorY,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  expect(mobileLayout).toEqual({
    ownerCount: 1,
    overscrollBehaviorY: 'contain',
    documentOverflow: 0,
  })
  await page.screenshot({
    path: testInfo.outputPath('mobile-light.png'),
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')
  await selectTheme(page, 'ダーク')
  await trigger.click()
  await expect(drawer.getByText('今月のまとめ')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('mobile-dark.png'),
    animations: 'disabled',
  })
})
