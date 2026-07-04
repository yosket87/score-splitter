import type { APIRequestContext } from '@playwright/test'

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
