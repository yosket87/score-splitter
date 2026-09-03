export interface AiDiagnosisMockStats {
  categoryProviderCalls: number
  narrativeProviderCalls: number
  diagnosisSaveCalls: number
}

const STATS_KEY = '__yamawakeAiDiagnosisMockStats'

type GlobalWithAiStats = typeof globalThis & {
  [STATS_KEY]?: AiDiagnosisMockStats
}

function stats(): AiDiagnosisMockStats {
  const target = globalThis as GlobalWithAiStats
  target[STATS_KEY] ??= {
    categoryProviderCalls: 0,
    narrativeProviderCalls: 0,
    diagnosisSaveCalls: 0,
  }
  return target[STATS_KEY]
}

export function resetAiDiagnosisMockStats(): void {
  Object.assign(stats(), {
    categoryProviderCalls: 0,
    narrativeProviderCalls: 0,
    diagnosisSaveCalls: 0,
  })
}

export function incrementAiDiagnosisMockStat(key: keyof AiDiagnosisMockStats): void {
  stats()[key] += 1
}

export function getAiDiagnosisMockStats(): AiDiagnosisMockStats {
  return { ...stats() }
}
