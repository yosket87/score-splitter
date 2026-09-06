import type { APIRequestContext, Page } from '@playwright/test'

const MOCK_PASSWORD = 'password'

export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('パスワード').fill(MOCK_PASSWORD)
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(/\/\d{4}\/\d{2}/)
}

export async function resetMockData(
  request: APIRequestContext
): Promise<void> {
  const response = await request.post('/api/mock/reset')

  if (!response.ok()) {
    throw new Error(
      `モックデータのリセットに失敗しました: ${response.status()}`
    )
  }
}

// シナリオCookieはBrowserContextごとに保持し、Google主要flowと停止後業務flowで共有する。
export async function prepareGoogleMock(page: Page, scenario: string): Promise<void> {
  const result = await page.request.post('/api/mock/google/prepare', { data: { scenario } })
  if (!result.ok()) throw new Error(`Googleモック準備に失敗しました: ${result.status()}`)
}
export async function googleLogin(page: Page, scenario = 'member-a'): Promise<void> {
  await prepareGoogleMock(page, scenario)
  await page.goto('/login')
  await page.getByRole('link', { name: 'Googleでログイン', exact: true }).click()
}
