import { describe, expect, it } from 'vitest'
import {
  buildDiagnosisAnalysis,
  composeDiagnosisView,
  getDiagnosisMonths,
} from '@/features/ai-diagnosis/analyze'
import type { AiNarrativeResult, DiagnosisContext } from '@/features/ai-diagnosis/domain'

const context: DiagnosisContext = {
  targetMonth: '202604',
  sourceRevision: 1,
  incomes: [{ month: '202604', amount: 600000 }],
  expenses: [
    { id: 'apr-dining', month: '202604', label: '外食', amount: -48000, isCarryover: false, aiCategory: 'dining' },
    { id: 'mar-dining', month: '202603', label: '外食', amount: -30000, isCarryover: false, aiCategory: 'dining' },
    { id: 'feb-dining', month: '202602', label: '外食', amount: -33000, isCarryover: false, aiCategory: 'dining' },
    { id: 'jan-dining', month: '202601', label: '外食', amount: -33000, isCarryover: false, aiCategory: 'dining' },
    { id: 'apr-health', month: '202604', label: '通院', amount: -20000, isCarryover: false, aiCategory: 'healthcare' },
    { id: 'apr-small', month: '202604', label: '雑貨', amount: -2500, isCarryover: false, aiCategory: 'household' },
    { id: 'apr-deferred', month: '202604', label: '繰越支出', amount: -50000, isCarryover: true, aiCategory: null },
  ],
  carryovers: [{ month: '202604', amount: -10000, isCleared: false }],
}

const oneOffTravelContext: DiagnosisContext = {
  targetMonth: '202604',
  sourceRevision: 1,
  incomes: [],
  expenses: [
    { id: 'apr-travel', month: '202604', label: '旅行', amount: -50000, isCarryover: false, aiCategory: 'travel' },
    { id: 'mar-travel', month: '202603', label: '旅行', amount: -10000, isCarryover: false, aiCategory: 'travel' },
  ],
  carryovers: [],
}

describe('buildDiagnosisAnalysis', () => {
  it('差額と増減率を満たす増加を差額降順で最大3件抽出する', () => {
    const result = buildDiagnosisAnalysis({
      targetMonth: '202604',
      sourceRevision: 1,
      incomes: [],
      expenses: [
        { id: 'apr-dining', month: '202604', label: '外食', amount: -50000, isCarryover: false, aiCategory: 'dining' },
        { id: 'apr-groceries', month: '202604', label: '食料品', amount: -42000, isCarryover: false, aiCategory: 'groceries' },
        { id: 'apr-household', month: '202604', label: '日用品', amount: -35000, isCarryover: false, aiCategory: 'household' },
        { id: 'apr-transportation', month: '202604', label: '交通費', amount: -30000, isCarryover: false, aiCategory: 'transportation' },
        { id: 'apr-other', month: '202604', label: 'その他', amount: -25000, isCarryover: false, aiCategory: 'other' },
        ...['202603', '202602', '202601'].flatMap((month) => [
          { id: `${month}-dining`, month, label: '外食', amount: -10000, isCarryover: false, aiCategory: 'dining' as const },
          { id: `${month}-groceries`, month, label: '食料品', amount: -10000, isCarryover: false, aiCategory: 'groceries' as const },
          { id: `${month}-household`, month, label: '日用品', amount: -10000, isCarryover: false, aiCategory: 'household' as const },
          { id: `${month}-transportation`, month, label: '交通費', amount: -10000, isCarryover: false, aiCategory: 'transportation' as const },
          { id: `${month}-other`, month, label: 'その他', amount: -10000, isCarryover: false, aiCategory: 'other' as const },
        ]),
      ],
      carryovers: [],
    })

    expect(result.notableCandidates.map(({ id, differenceAmount }) => ({ id, differenceAmount }))).toEqual([
      { id: 'increase:dining', differenceAmount: 40000 },
      { id: 'increase:groceries', differenceAmount: 32000 },
      { id: 'increase:household', differenceAmount: 25000 },
    ])
    expect(result.suggestionCandidates).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'other' })]),
    )
  })

  it('医療費と繰越支出を削減候補にしない', () => {
    const result = buildDiagnosisAnalysis(context)
    expect(result.suggestionCandidates).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'healthcare' })]),
    )
    expect(result.currentExpenseTotal).toBe(70500)
    expect(result.unresolvedCarryoverTotal).toBe(10000)
  })

  it('比較3か月中2か月以上で0円のカテゴリを一時支出として削減候補から外す', () => {
    const result = buildDiagnosisAnalysis(oneOffTravelContext)
    expect(result.notableCandidates).toEqual([
      expect.objectContaining({ category: 'travel', isLikelyOneOff: true }),
    ])
    expect(result.suggestionCandidates).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'travel' })]),
    )
  })

  it('減少を良かった点として抽出し、必要なID以外のAI出力を拒否する', () => {
    const analysis = buildDiagnosisAnalysis({
      ...context,
      expenses: [
        { id: 'apr-groceries', month: '202604', label: '食料品', amount: -20000, isCarryover: false, aiCategory: 'groceries' },
        { id: 'mar-groceries', month: '202603', label: '食料品', amount: -30000, isCarryover: false, aiCategory: 'groceries' },
        { id: 'feb-groceries', month: '202602', label: '食料品', amount: -30000, isCarryover: false, aiCategory: 'groceries' },
        { id: 'jan-groceries', month: '202601', label: '食料品', amount: -30000, isCarryover: false, aiCategory: 'groceries' },
      ],
    })
    expect(analysis.positiveCandidates).toEqual([
      expect.objectContaining({ id: 'positive:groceries', differenceAmount: -10000, differenceRate: -1 / 3 }),
    ])

    const narrative: AiNarrativeResult = {
      summaryText: '要約',
      notableChanges: [],
      positivePoints: [{ candidateId: 'positive:groceries', commentary: '節約できています' }],
      suggestions: [],
      dataSufficiency: 'full',
    }
    expect(composeDiagnosisView(analysis, narrative).positivePoints[0]).toEqual(
      expect.objectContaining({ category: 'groceries', currentAmount: 20000, commentary: '節約できています' }),
    )
    expect(() => composeDiagnosisView(analysis, { ...narrative, suggestions: [{ candidateId: 'unknown', commentary: '不正' }] })).toThrow()
  })

  it('過去3か月に各1万円あり当月0円のカテゴリを安全な過去ラベルで良かった点にする', () => {
    const analysis = buildDiagnosisAnalysis({
      targetMonth: '202604',
      sourceRevision: 1,
      incomes: [],
      expenses: [
        { id: 'apr-dining', month: '202604', label: '外食', amount: -5000, isCarryover: false, aiCategory: 'dining' },
        { id: 'mar-grocery', month: '202603', label: '食料品', amount: -10000, isCarryover: false, aiCategory: 'groceries' },
        { id: 'feb-grocery', month: '202602', label: '食料品', amount: -10000, isCarryover: false, aiCategory: 'groceries' },
        { id: 'jan-grocery', month: '202601', label: '食料品', amount: -10000, isCarryover: false, aiCategory: 'groceries' },
      ],
      carryovers: [],
    })

    expect(analysis.positiveCandidates).toContainEqual(
      expect.objectContaining({
        id: 'positive:groceries',
        currentAmount: 0,
        baselineAmount: 10000,
        differenceAmount: -10000,
        differenceRate: -1,
        contributingLabels: ['食料品'],
      })
    )
  })

  it('比較月が一部だけでも当月0円のカテゴリを良かった点にする', () => {
    const analysis = buildDiagnosisAnalysis({
      targetMonth: '202604',
      sourceRevision: 1,
      incomes: [],
      expenses: [
        { id: 'apr-dining', month: '202604', label: '外食', amount: -5000, isCarryover: false, aiCategory: 'dining' },
        { id: 'mar-transport', month: '202603', label: '電車', amount: -6000, isCarryover: false, aiCategory: 'transportation' },
      ],
      carryovers: [],
    })

    expect(analysis.positiveCandidates).toContainEqual(
      expect.objectContaining({
        category: 'transportation',
        currentAmount: 0,
        baselineAmount: 6000,
        contributingLabels: ['電車'],
      })
    )
  })
})

describe('getDiagnosisMonths', () => {
  it('年境界をまたいで対象月と直前3か月を返す', () => {
    expect(getDiagnosisMonths('202601')).toEqual(['202601', '202512', '202511', '202510'])
  })

  it('無効な月を拒否する', () => {
    expect(() => getDiagnosisMonths('202613')).toThrow()
  })
})
