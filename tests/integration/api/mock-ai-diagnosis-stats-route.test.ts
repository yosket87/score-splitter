import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/mock/ai-diagnosis-stats/route'
import {
  incrementAiDiagnosisMockStat,
  resetAiDiagnosisMockStats,
} from '@/mocks/ai-diagnosis-stats'

const originalUseMocks = process.env.USE_MOCKS

afterEach(() => {
  if (originalUseMocks === undefined) delete process.env.USE_MOCKS
  else process.env.USE_MOCKS = originalUseMocks
  resetAiDiagnosisMockStats()
})

describe('AI診断mock統計endpoint', () => {
  it('mock環境以外では404として統計を公開しない', async () => {
    delete process.env.USE_MOCKS

    const response = await GET()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'エンドポイントが見つかりません',
    })
  })

  it('mock環境でだけproviderと保存の回数を返す', async () => {
    process.env.USE_MOCKS = 'true'
    resetAiDiagnosisMockStats()
    incrementAiDiagnosisMockStat('categoryProviderCalls')
    incrementAiDiagnosisMockStat('narrativeProviderCalls')
    incrementAiDiagnosisMockStat('diagnosisSaveCalls')

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      categoryProviderCalls: 1,
      narrativeProviderCalls: 1,
      diagnosisSaveCalls: 1,
    })
  })
})
