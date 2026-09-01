import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientOptions } from 'openai'

import { createOpenAiDiagnosisProvider } from '@/features/ai-diagnosis/openai-provider'
import { createAiDiagnosisProvider } from '@/features/ai-diagnosis/provider'
import type { NarrativeInput } from '@/features/ai-diagnosis/domain'

type Request = {
  model: string
  store: boolean
  input: Array<{ role: string; content: string }>
  text?: { format?: { type?: string; strict?: boolean | null; name?: string } }
}

const narrativeInput: NarrativeInput = {
  targetMonth: '202608',
  currentExpenseTotal: 86_000,
  baselineExpenseAverage: 70_000,
  unresolvedCarryoverTotal: 4_000,
  dataSufficiency: 'full',
  notableCandidates: [{
    id: 'increase:dining',
    kind: 'increase',
    category: 'dining',
    currentAmount: 26_000,
    baselineAmount: 10_000,
    differenceAmount: 16_000,
    differenceRate: 1.6,
    potentialAmount: null,
    contributingLabels: ['Uber Eats'],
    isLikelyOneOff: false,
  }],
  positiveCandidates: [],
  suggestionCandidates: [{
    id: 'suggestion:dining',
    kind: 'suggestion',
    category: 'dining',
    currentAmount: 26_000,
    baselineAmount: 10_000,
    differenceAmount: 16_000,
    differenceRate: 1.6,
    potentialAmount: 16_000,
    contributingLabels: ['Uber Eats'],
    isLikelyOneOff: false,
  }],
}

const validNarrative = {
  summaryText: '外食の変化が目立つ月でした',
  notableChanges: [{ candidateId: 'increase:dining', commentary: '意図した支出だったか振り返れそうです' }],
  positivePoints: [],
  suggestions: [{ candidateId: 'suggestion:dining', commentary: '次の月に回数を話し合う選択肢があります' }],
  dataSufficiency: 'full',
}

class FakeResponsesClient {
  lastRequest: Request | undefined
  calls = 0

  constructor(private readonly outputs: unknown[] = [{
    assignments: [
      { label: 'Uber Eats', category: 'dining' },
      { label: 'イオン', category: 'groceries' },
    ],
  }], private readonly responseOutputs: unknown[][] = []) {}

  async parse(request: Request) {
    this.lastRequest = request
    const callIndex = this.calls
    const outputParsed = this.outputs[callIndex]
    this.calls += 1
    return {
      output_parsed: outputParsed,
      output: this.responseOutputs[callIndex] ?? [],
    }
  }
}

describe('OpenAI家計診断プロバイダー', () => {
  it('分類要求を保存せずラベルだけを未信頼データとして分離する', async () => {
    const responses = new FakeResponsesClient()
    const provider = createOpenAiDiagnosisProvider({
      apiKey: 'test-api-key',
      responses,
    })

    await expect(provider.classifyLabels(['Uber Eats', 'イオン'])).resolves.toEqual([
      { label: 'Uber Eats', category: 'dining' },
      { label: 'イオン', category: 'groceries' },
    ])

    expect(responses.lastRequest).toMatchObject({
      model: 'gpt-5-mini',
      store: false,
      input: [
        { role: 'developer', content: expect.any(String) },
        { role: 'user', content: JSON.stringify({ labels: ['Uber Eats', 'イオン'] }) },
      ],
      text: { format: { type: 'json_schema', strict: true, name: 'expense_classifications' } },
    })
    expect(JSON.stringify(responses.lastRequest)).not.toMatch(/husband|wife|person|amount|month|id/i)
  })

  it('重複除去した入力ラベルと分類結果の完全対応を保証する', async () => {
    const responses = new FakeResponsesClient([{
      assignments: [
        { label: 'イオン', category: 'groceries' },
        { label: 'Uber Eats', category: 'dining' },
      ],
    }])
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.classifyLabels(['Uber Eats', 'イオン', 'Uber Eats'])).resolves.toHaveLength(2)

    expect(responses.lastRequest?.input[1]?.content).toBe(JSON.stringify({ labels: ['Uber Eats', 'イオン'] }))
  })

  it('分類の構造違反だけを一度再試行する', async () => {
    const responses = new FakeResponsesClient([
      { assignments: [{ label: '未知', category: 'unknown' }] },
      { assignments: [{ label: 'イオン', category: 'groceries' }] },
    ])
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.classifyLabels(['イオン'])).resolves.toEqual([
      { label: 'イオン', category: 'groceries' },
    ])
    expect(responses.calls).toBe(2)
  })

  it('診断要求には分析済み候補だけを数値なしで送る', async () => {
    const responses = new FakeResponsesClient([validNarrative])
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.generateNarrative(narrativeInput)).resolves.toEqual(validNarrative)

    expect(responses.lastRequest).toMatchObject({
      model: 'gpt-5-mini',
      store: false,
      input: [
        { role: 'developer', content: expect.any(String) },
        { role: 'user', content: expect.any(String) },
      ],
    })
    const userData = JSON.parse(responses.lastRequest?.input[1]?.content ?? '{}')
    expect(userData).toEqual({
      dataSufficiency: 'full',
      candidates: [
        {
          candidateId: 'increase:dining',
          kind: 'notable',
          category: 'dining',
          contributingLabels: ['Uber Eats'],
          isLikelyOneOff: false,
        },
        {
          candidateId: 'suggestion:dining',
          kind: 'suggestion',
          category: 'dining',
          contributingLabels: ['Uber Eats'],
          isLikelyOneOff: false,
        },
      ],
    })
    expect(JSON.stringify(userData)).not.toMatch(/202608|26000|16000|currentAmount|differenceRate/)
  })

  it('数値と個人評価を含む診断文を拒否して一度再試行する', async () => {
    const responses = new FakeResponsesClient([
      {
        ...validNarrative,
        summaryText: '夫の外食が１６，０００円増えました',
      },
      validNarrative,
    ])
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.generateNarrative(narrativeInput)).resolves.toEqual(validNarrative)
    expect(responses.calls).toBe(2)
  })

  it.each([
    ['未知ID', { ...validNarrative, notableChanges: [{ candidateId: 'unknown', commentary: '説明です' }] }],
    ['種別違い', { ...validNarrative, notableChanges: [{ candidateId: 'suggestion:dining', commentary: '説明です' }] }],
    ['重複ID', {
      ...validNarrative,
      notableChanges: [
        { candidateId: 'increase:dining', commentary: '説明です' },
        { candidateId: 'increase:dining', commentary: '別の説明です' },
      ],
    }],
  ])('診断応答の%sを二度とも拒否する', async (_caseName, invalidNarrative) => {
    const responses = new FakeResponsesClient([invalidNarrative, invalidNarrative])
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.generateNarrative(narrativeInput)).rejects.toThrow('候補ID')
    expect(responses.calls).toBe(2)
  })

  it.each(['7', '７', '¥', '円', '%', '夫', '妻', 'husband', 'wife', '浪費', '無駄遣い'])(
    '診断文の禁止表現「%s」を二度とも拒否する',
    async (unsafeText) => {
      const invalidNarrative = { ...validNarrative, summaryText: `振り返り${unsafeText}` }
      const responses = new FakeResponsesClient([invalidNarrative, invalidNarrative])
      const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

      await expect(provider.generateNarrative(narrativeInput)).rejects.toThrow('評価表現')
      expect(responses.calls).toBe(2)
    },
  )

  it('refusalと空の構造化出力を拒否する', async () => {
    const responses = new FakeResponsesClient(
      [null, null],
      [
        [{ type: 'message', content: [{ type: 'refusal', refusal: '回答できません' }] }],
        [{ type: 'message', content: [{ type: 'refusal', refusal: '回答できません' }] }],
      ],
    )
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.generateNarrative(narrativeInput)).rejects.toThrow('拒否')
    expect(responses.calls).toBe(2)
  })

  it('SDK通信エラーをアプリ側で再試行しない', async () => {
    const sdkError = new Error('network unavailable')
    const responses = {
      calls: 0,
      async parse() {
        this.calls += 1
        throw sdkError
      },
    }
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.generateNarrative(narrativeInput)).rejects.toBe(sdkError)
    expect(responses.calls).toBe(1)
  })

  it.each([81, 255])(
    '%s文字の正当な支出ラベルを切り詰めず分類する',
    async (length) => {
      const label = 'あ'.repeat(length)
      const responses = new FakeResponsesClient([{
        assignments: [{ label, category: 'other' }],
      }])
      const provider = createOpenAiDiagnosisProvider({
        apiKey: 'test-api-key',
        responses,
      })

      await expect(provider.classifyLabels([label])).resolves.toEqual([
        { label, category: 'other' },
      ])
      expect(responses.lastRequest?.input[1]?.content).toBe(
        JSON.stringify({ labels: [label] })
      )
    }
  )

  it('分類入力を重複除去後100件・各255文字に制限する', async () => {
    const responses = new FakeResponsesClient()
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })
    const tooManyLabels = Array.from({ length: 101 }, (_, index) => `ラベル${index}`)

    await expect(provider.classifyLabels(tooManyLabels)).rejects.toThrow()
    await expect(provider.classifyLabels(['あ'.repeat(256)])).rejects.toThrow()
    expect(responses.calls).toBe(0)
  })

  it('分類結果の欠落と重複を拒否する', async () => {
    const invalidResult = {
      assignments: [
        { label: 'イオン', category: 'groceries' },
        { label: 'イオン', category: 'groceries' },
      ],
    }
    const responses = new FakeResponsesClient([invalidResult, invalidResult])
    const provider = createOpenAiDiagnosisProvider({ apiKey: 'test-api-key', responses })

    await expect(provider.classifyLabels(['イオン', 'Uber Eats'])).rejects.toThrow('完全に対応')
    expect(responses.calls).toBe(2)
  })

  it('分類用と診断用のモデルを個別に上書きする', async () => {
    const responses = new FakeResponsesClient([
      { assignments: [{ label: 'イオン', category: 'groceries' }] },
      validNarrative,
    ])
    const provider = createOpenAiDiagnosisProvider({
      apiKey: 'test-api-key',
      classificationModel: 'classification-model',
      diagnosisModel: 'diagnosis-model',
      responses,
    })

    await provider.classifyLabels(['イオン'])
    expect(responses.lastRequest?.model).toBe('classification-model')
    await provider.generateNarrative(narrativeInput)
    expect(responses.lastRequest?.model).toBe('diagnosis-model')
  })

  it('OPENAI_LOGがdebugでもSDKのログと自動再試行を無効にする', () => {
    vi.stubEnv('OPENAI_LOG', 'debug')
    vi.stubGlobal('window', undefined)
    let receivedOptions: ClientOptions | undefined
    const responses = new FakeResponsesClient()
    const openAiClientFactory = (options: ClientOptions) => {
      receivedOptions = options
      return { responses }
    }

    createOpenAiDiagnosisProvider({
      apiKey: ['constructor', 'test', 'key'].join('-'),
      openAiClientFactory,
    })

    expect(receivedOptions).toBeDefined()
    expect(typeof receivedOptions?.apiKey).toBe('string')
    const safeOptions = Object.fromEntries(
      Object.entries(receivedOptions ?? {}).filter(([key]) => key !== 'apiKey'),
    )
    expect(safeOptions).toEqual({ timeout: 15_000, maxRetries: 0, logLevel: 'off' })
  })
})

describe('家計診断プロバイダーfactory', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('mock設定をfactory呼び出し時に読み決定的な結果を返す', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    vi.stubEnv('OPENAI_API_KEY', '')

    const first = createAiDiagnosisProvider()
    const second = createAiDiagnosisProvider()

    await expect(first.classifyLabels(['Uber Eats', 'イオン'])).resolves.toEqual([
      { label: 'Uber Eats', category: 'dining' },
      { label: 'イオン', category: 'groceries' },
    ])
    await expect(second.generateNarrative(narrativeInput)).resolves.toEqual(
      await first.generateNarrative(narrativeInput),
    )
  })

  it('OpenAI設定ではfactory呼び出し時にAPIキーを必須とする', () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', '')

    expect(() => createAiDiagnosisProvider()).toThrow('OPENAI_API_KEY')

    vi.stubEnv('OPENAI_API_KEY', 'set-after-module-import')
    vi.stubGlobal('window', undefined)
    expect(() => createAiDiagnosisProvider()).not.toThrow()
  })
})
