import { z } from 'zod'

import {
  type AiCategory,
  type AiNarrativeResult,
  type CategoryAssignment,
  type NarrativeInput,
} from './domain'
import { createOpenAiDiagnosisProvider } from './openai-provider'

export interface AiDiagnosisProvider {
  classifyLabels(labels: string[]): Promise<CategoryAssignment[]>
  generateNarrative(input: NarrativeInput): Promise<AiNarrativeResult>
}

const mockLabelsSchema = z.array(z.string().min(1).max(255)).max(100)

const MOCK_CATEGORY_RULES: ReadonlyArray<{ keywords: readonly string[]; category: AiCategory }> = [
  { keywords: ['uber eats', '外食', 'レストラン', 'カフェ'], category: 'dining' },
  { keywords: ['イオン', 'スーパー', '食材', '食品'], category: 'groceries' },
  { keywords: ['家賃', '住宅', '管理費'], category: 'housing' },
  { keywords: ['電気', 'ガス', '水道'], category: 'utilities' },
  { keywords: ['携帯', 'スマホ', '通信', 'インターネット'], category: 'communications' },
  { keywords: ['電車', 'バス', 'タクシー', '交通'], category: 'transportation' },
  { keywords: ['病院', '薬局', '医療'], category: 'healthcare' },
  { keywords: ['美容', '衣服', '洋服'], category: 'clothing_beauty' },
  { keywords: ['netflix', 'spotify', 'サブスク'], category: 'subscriptions' },
  { keywords: ['映画', 'ゲーム', '娯楽'], category: 'entertainment' },
  { keywords: ['旅行', 'ホテル', '航空'], category: 'travel' },
  { keywords: ['贈答', 'プレゼント', '交際'], category: 'social_gifts' },
  { keywords: ['日用品', 'ドラッグストア', '雑貨'], category: 'household' },
]

export function createAiDiagnosisProvider(): AiDiagnosisProvider {
  const provider = String(process.env.AI_PROVIDER ?? '')
  if (provider === 'mock') return new MockAiDiagnosisProvider()

  return createOpenAiDiagnosisProvider({
    apiKey: requiredEnv('OPENAI_API_KEY'),
    classificationModel: optionalEnv('OPENAI_CLASSIFICATION_MODEL'),
    diagnosisModel: optionalEnv('OPENAI_DIAGNOSIS_MODEL'),
  })
}

export class MockAiDiagnosisProvider implements AiDiagnosisProvider {
  async classifyLabels(labels: string[]): Promise<CategoryAssignment[]> {
    const uniqueLabels = mockLabelsSchema.parse([...new Set(labels)])
    return uniqueLabels.map((label) => ({ label, category: classifyMockLabel(label) }))
  }

  async generateNarrative(input: NarrativeInput): Promise<AiNarrativeResult> {
    const delayMs = Number(process.env.AI_MOCK_DELAY_MS ?? 0)
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    return {
      summaryText: summaryFor(input.dataSufficiency),
      notableChanges: input.notableCandidates.map(({ id }) => ({
        candidateId: id,
        commentary: '意図した支出だったか家庭で振り返れそうです',
      })),
      positivePoints: input.positiveCandidates.map(({ id }) => ({
        candidateId: id,
        commentary: '続けたい変化として家庭で共有できそうです',
      })),
      suggestions: input.suggestionCandidates.map(({ id }) => ({
        candidateId: id,
        commentary: '次の月に取り入れ方を話し合う選択肢があります',
      })),
      dataSufficiency: input.dataSufficiency,
    }
  }
}

function classifyMockLabel(label: string): AiCategory {
  const normalized = label.toLocaleLowerCase('ja-JP')
  return MOCK_CATEGORY_RULES.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)))?.category ?? 'other'
}

function summaryFor(dataSufficiency: NarrativeInput['dataSufficiency']): string {
  if (dataSufficiency === 'current_only') return '今月の支出構成を振り返りました'
  if (dataSufficiency === 'reference') return '利用できる過去の傾向を参考に振り返りました'
  return '過去の傾向と比べて今月を振り返りました'
}

function requiredEnv(name: 'OPENAI_API_KEY'): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name}が設定されていません。`)
  return value
}

function optionalEnv(name: 'OPENAI_CLASSIFICATION_MODEL' | 'OPENAI_DIAGNOSIS_MODEL'): string | undefined {
  return process.env[name]?.trim() || undefined
}
