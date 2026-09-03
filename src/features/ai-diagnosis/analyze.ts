import type {
  AiCategory,
  AiDiagnosisView,
  AiNarrativeResult,
  DataSufficiency,
  DiagnosisAnalysis,
  DiagnosisCandidate,
  DiagnosisContext,
  DiagnosisExpense,
  DiagnosisViewItem,
} from './domain'

export const DIAGNOSIS_THRESHOLDS = {
  minimumDifference: 3000,
  minimumRate: 0.2,
  maximumNotableChanges: 3,
} as const

const PROTECTED_SUGGESTION_CATEGORIES = new Set<AiCategory>(['healthcare', 'other'])
const ONE_OFF_LABEL_SHARE = 0.8

export function getDiagnosisMonths(month: string): string[] {
  if (!/^\d{6}$/.test(month)) {
    throw new Error('月はYYYYMM形式で指定してください。')
  }

  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(4, 6))
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error('月は01から12で指定してください。')
  }

  return Array.from({ length: 4 }, (_, index) => {
    const totalMonths = year * 12 + (monthNumber - 1) - index
    const resultYear = Math.floor(totalMonths / 12)
    const resultMonth = (totalMonths % 12) + 1
    return `${resultYear}${String(resultMonth).padStart(2, '0')}`
  })
}

export function buildDiagnosisAnalysis(context: DiagnosisContext): DiagnosisAnalysis {
  const actualExpenses = context.expenses.filter((expense) => !expense.isCarryover)
  return buildAnalysisFromCategoryTotals(context.targetMonth, actualExpenses, context.carryovers)
}

function buildAnalysisFromCategoryTotals(
  targetMonth: string,
  expenses: DiagnosisExpense[],
  carryovers: DiagnosisContext['carryovers'],
): DiagnosisAnalysis {
  const [currentMonth, ...referenceMonths] = getDiagnosisMonths(targetMonth)
  const currentExpenses = expenses.filter((expense) => expense.month === currentMonth)
  const availableReferenceMonths = referenceMonths.filter((month) => expenses.some((expense) => expense.month === month))
  const dataSufficiency = getDataSufficiency(availableReferenceMonths.length)
  const categoryTotals = createCategoryTotals(expenses, [currentMonth, ...referenceMonths])
  const currentExpenseTotal = sumAmounts(currentExpenses)
  const baselineExpenseAverage = availableReferenceMonths.length === 0
    ? null
    : availableReferenceMonths.reduce((total, month) => total + sumAmounts(expenses.filter((expense) => expense.month === month)), 0) / availableReferenceMonths.length
  const candidates = [...categoryTotals.entries()]
    .map(([category, totals]) => createCategoryCandidate(
      category,
      totals,
      currentMonth,
      currentExpenses,
      expenses,
      referenceMonths,
      availableReferenceMonths,
    ))
  const notableCandidates = candidates
    .filter(isIncrease)
    .sort(sortByLargestDifference)
    .slice(0, DIAGNOSIS_THRESHOLDS.maximumNotableChanges)
    .map((candidate) => ({ ...candidate, id: `increase:${candidate.category}`, kind: 'increase' as const }))
  const positiveCandidates = createPositiveCandidates(candidates, availableReferenceMonths)
  const suggestionCandidates = candidates
    .filter((candidate) => isIncrease(candidate) && !candidate.isLikelyOneOff && !PROTECTED_SUGGESTION_CATEGORIES.has(candidate.category))
    .sort(sortByLargestDifference)
    .map((candidate) => ({
      ...candidate,
      id: `suggestion:${candidate.category}`,
      kind: 'suggestion' as const,
      potentialAmount: candidate.differenceAmount,
    }))

  return {
    targetMonth,
    currentExpenseTotal,
    baselineExpenseAverage,
    unresolvedCarryoverTotal: carryovers
      .filter((carryover) => carryover.month === targetMonth && !carryover.isCleared)
      .reduce((total, carryover) => total + Math.abs(carryover.amount), 0),
    dataSufficiency,
    notableCandidates,
    positiveCandidates,
    suggestionCandidates,
  }
}

function createCategoryTotals(expenses: DiagnosisExpense[], months: string[]): Map<AiCategory, Map<string, number>> {
  return expenses.reduce((categories, expense) => {
    if (expense.aiCategory === null || !months.includes(expense.month)) return categories
    const totals = new Map(categories.get(expense.aiCategory) ?? [])
    totals.set(expense.month, (totals.get(expense.month) ?? 0) + Math.abs(expense.amount))
    return new Map(categories).set(expense.aiCategory, totals)
  }, new Map<AiCategory, Map<string, number>>())
}

function createCategoryCandidate(
  category: AiCategory,
  totals: Map<string, number>,
  targetMonth: string,
  currentExpenses: DiagnosisExpense[],
  allExpenses: DiagnosisExpense[],
  referenceMonths: string[],
  availableReferenceMonths: string[],
): DiagnosisCandidate {
  const actualCurrentAmount = totals.get(targetMonth) ?? 0
  const referenceAmounts = referenceMonths.map((month) => totals.get(month) ?? 0)
  const baselineAmount = availableReferenceMonths.length === 0
    ? null
    : availableReferenceMonths.reduce((total, month) => total + (totals.get(month) ?? 0), 0) / availableReferenceMonths.length
  const differenceAmount = baselineAmount === null ? actualCurrentAmount : actualCurrentAmount - baselineAmount
  const differenceRate = baselineAmount === null || baselineAmount === 0 ? null : differenceAmount / baselineAmount
  const contributingExpenses = currentExpenses.filter((expense) => expense.aiCategory === category)
  const labelSources = contributingExpenses.length > 0
    ? contributingExpenses
    : allExpenses.filter(
        (expense) =>
          referenceMonths.includes(expense.month) && expense.aiCategory === category
      )
  const contributingLabels = [
    ...new Set(labelSources.map((expense) => expense.label)),
  ].sort()
  const isLikelyOneOff = isOneOff(actualCurrentAmount, referenceAmounts, contributingExpenses, allExpenses, referenceMonths)

  return {
    id: `increase:${category}`,
    kind: 'increase',
    category,
    currentAmount: actualCurrentAmount,
    baselineAmount,
    differenceAmount,
    differenceRate,
    potentialAmount: null,
    contributingLabels,
    isLikelyOneOff,
  }
}

function isOneOff(
  currentAmount: number,
  referenceAmounts: number[],
  currentExpenses: DiagnosisExpense[],
  allExpenses: DiagnosisExpense[],
  referenceMonths: string[],
): boolean {
  const zeroMonthCount = referenceAmounts.filter((amount) => amount === 0).length
  if (zeroMonthCount >= 2) return true
  return currentExpenses.some((expense) => Math.abs(expense.amount) / currentAmount >= ONE_OFF_LABEL_SHARE
    && !allExpenses.some((reference) => referenceMonths.includes(reference.month) && reference.label === expense.label))
}

function createPositiveCandidates(candidates: DiagnosisCandidate[], availableReferenceMonths: string[]): DiagnosisCandidate[] {
  const decreases = candidates
    .filter((candidate) => candidate.baselineAmount !== null
      && candidate.differenceAmount <= -DIAGNOSIS_THRESHOLDS.minimumDifference
      && candidate.differenceRate !== null
      && candidate.differenceRate <= -DIAGNOSIS_THRESHOLDS.minimumRate)
    .sort((left, right) => left.differenceAmount - right.differenceAmount)

  const stable = decreases.length > 0 ? decreases : candidates
    .filter((candidate) => candidate.currentAmount >= 10000
      && availableReferenceMonths.length === 3
      && candidate.baselineAmount !== null
      && candidate.baselineAmount > 0
      && Math.abs(candidate.differenceAmount / candidate.baselineAmount) <= 0.1)
    .sort((left, right) => right.currentAmount - left.currentAmount)
    .slice(0, 1)

  return stable.map((candidate) => ({ ...candidate, id: `positive:${candidate.category}`, kind: 'positive' as const }))
}

function isIncrease(candidate: DiagnosisCandidate): boolean {
  return candidate.currentAmount >= DIAGNOSIS_THRESHOLDS.minimumDifference
    && candidate.differenceAmount >= DIAGNOSIS_THRESHOLDS.minimumDifference
    && (candidate.baselineAmount === 0 || (candidate.differenceRate !== null && candidate.differenceRate >= DIAGNOSIS_THRESHOLDS.minimumRate))
}

function getDataSufficiency(referenceMonthCount: number): DataSufficiency {
  if (referenceMonthCount === 0) return 'current_only'
  if (referenceMonthCount < 3) return 'reference'
  return 'full'
}

function sumAmounts(expenses: DiagnosisExpense[]): number {
  return expenses.reduce((total, expense) => total + Math.abs(expense.amount), 0)
}

function sortByLargestDifference(left: DiagnosisCandidate, right: DiagnosisCandidate): number {
  return right.differenceAmount - left.differenceAmount || left.category.localeCompare(right.category)
}

export function composeDiagnosisView(analysis: DiagnosisAnalysis, narrative: AiNarrativeResult): AiDiagnosisView {
  assertNarrativeCoverage(analysis, narrative)
  return {
    month: analysis.targetMonth,
    summaryText: narrative.summaryText,
    currentExpenseTotal: analysis.currentExpenseTotal,
    baselineExpenseAverage: analysis.baselineExpenseAverage,
    unresolvedCarryoverTotal: analysis.unresolvedCarryoverTotal,
    notableChanges: composeViewItems(analysis.notableCandidates, narrative.notableChanges),
    positivePoints: composeViewItems(analysis.positiveCandidates, narrative.positivePoints),
    suggestions: composeViewItems(analysis.suggestionCandidates, narrative.suggestions),
    dataSufficiency: analysis.dataSufficiency,
  }
}

function assertNarrativeCoverage(
  analysis: DiagnosisAnalysis,
  narrative: AiNarrativeResult
): void {
  const groups = [
    [analysis.notableCandidates, narrative.notableChanges],
    [analysis.positiveCandidates, narrative.positivePoints],
    [analysis.suggestionCandidates, narrative.suggestions],
  ]
  if (groups.some(([candidates, items]) => candidates.length > 0 && items.length === 0)) {
    throw new Error('入力候補があるグループには診断文が最低1件必要です。')
  }
}

function composeViewItems(candidates: DiagnosisCandidate[], narratives: Array<{ candidateId: string; commentary: string }>): DiagnosisViewItem[] {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  return narratives.map(({ candidateId, commentary }) => {
    const candidate = candidatesById.get(candidateId)
    if (candidate === undefined) throw new Error(`許可されていない診断候補IDです: ${candidateId}`)
    return { ...candidate, commentary }
  })
}
