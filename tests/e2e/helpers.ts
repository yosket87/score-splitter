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
