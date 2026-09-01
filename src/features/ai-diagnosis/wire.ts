import { AI_CATEGORY_SET, type AiCategory } from './categories'
import type {
  AiDiagnosisView,
  DiagnosisViewItem,
  ExpenseCategoryAssignment,
  SaveDiagnosisInput,
} from './domain'
import { AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES } from './limits'

export class AiDiagnosisWireError extends Error {}

function invalid(message: string): never {
  throw new AiDiagnosisWireError(message)
}

function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('リクエスト形式が不正です')
  }
  return value as Record<string, unknown>
}

function assertExactKeys(input: Record<string, unknown>, allowedKeys: string[]): void {
  if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
    invalid('リクエスト形式が不正です')
  }
}

function parseString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${name}が不正です`)
  return value
}

export function parseAiDiagnosisMonth(value: unknown): string {
  const month = parseString(value, 'month')
  if (!/^\d{6}$/.test(month)) invalid('monthが不正です')
  const monthNumber = Number(month.slice(4, 6))
  if (monthNumber < 1 || monthNumber > 12) invalid('monthが不正です')
  return month
}

export function parseRunTokenInput(value: unknown): { runToken: string } {
  const input = assertObject(value)
  assertExactKeys(input, ['runToken'])
  return { runToken: parseString(input.runToken, 'runToken') }
}

export function parseCategoryAssignments(value: unknown): {
  month: string
  runToken: string
  assignments: ExpenseCategoryAssignment[]
} {
  const input = assertObject(value)
  assertExactKeys(input, ['month', 'runToken', 'assignments'])
  if (!Array.isArray(input.assignments)) invalid('assignmentsが不正です')

  const assignments = input.assignments.map((assignment) => {
    const item = assertObject(assignment)
    assertExactKeys(item, ['expenseIds', 'category', 'expectedLabel'])
    if (!Array.isArray(item.expenseIds)) invalid('expenseIdsが不正です')
    const expenseIds = item.expenseIds.map((id) => parseString(id, 'expenseIds'))
    const category = parseString(item.category, 'category')
    if (!AI_CATEGORY_SET.has(category)) invalid('categoryが不正です')
    return {
      expenseIds,
      category: category as AiCategory,
      expectedLabel: parseString(item.expectedLabel, 'expectedLabel'),
    }
  })

  const expenseCount = assignments.reduce(
    (count, assignment) => count + assignment.expenseIds.length,
    0
  )
  if (expenseCount > AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES) {
    invalid('一度に分類できる支出は100件までです')
  }
  const expenseIds = assignments.flatMap((assignment) => assignment.expenseIds)
  if (new Set(expenseIds).size !== expenseIds.length) {
    invalid('支出IDが重複しています')
  }
  return {
    month: parseAiDiagnosisMonth(input.month),
    runToken: parseString(input.runToken, 'runToken'),
    assignments,
  }
}

export function parseSaveDiagnosisInput(value: unknown): SaveDiagnosisInput {
  const input = assertObject(value)
  assertExactKeys(input, [
    'runToken',
    'inputHash',
    'analysisVersion',
    'diagnosis',
    'expectedSourceRevision',
  ])
  return {
    runToken: parseString(input.runToken, 'runToken'),
    inputHash: parseString(input.inputHash, 'inputHash'),
    analysisVersion: parseString(input.analysisVersion, 'analysisVersion'),
    diagnosis: parseDiagnosisView(input.diagnosis),
    expectedSourceRevision: parseNonnegativeInteger(
      input.expectedSourceRevision,
      'expectedSourceRevision'
    ),
  }
}

export function parseDiagnosisView(value: unknown): AiDiagnosisView {
  const input = assertObject(value)
  assertExactKeys(input, [
    'month', 'summaryText', 'currentExpenseTotal', 'baselineExpenseAverage',
    'unresolvedCarryoverTotal', 'notableChanges', 'positivePoints', 'suggestions',
    'dataSufficiency',
  ])
  return {
    month: parseAiDiagnosisMonth(input.month),
    summaryText: parseString(input.summaryText, 'summaryText'),
    currentExpenseTotal: parseNumber(input.currentExpenseTotal, 'currentExpenseTotal'),
    baselineExpenseAverage: parseNullableNumber(
      input.baselineExpenseAverage,
      'baselineExpenseAverage'
    ),
    unresolvedCarryoverTotal: parseNumber(
      input.unresolvedCarryoverTotal,
      'unresolvedCarryoverTotal'
    ),
    notableChanges: parseDiagnosisViewItems(input.notableChanges, 'notableChanges'),
    positivePoints: parseDiagnosisViewItems(input.positivePoints, 'positivePoints'),
    suggestions: parseDiagnosisViewItems(input.suggestions, 'suggestions'),
    dataSufficiency: parseDataSufficiency(input.dataSufficiency),
  }
}

function parseDiagnosisViewItems(value: unknown, name: string): DiagnosisViewItem[] {
  if (!Array.isArray(value)) invalid(`${name}が不正です`)
  return value.map((item) => parseDiagnosisViewItem(item))
}

function parseDiagnosisViewItem(value: unknown): DiagnosisViewItem {
  const input = assertObject(value)
  assertExactKeys(input, [
    'id', 'kind', 'category', 'currentAmount', 'baselineAmount', 'differenceAmount',
    'differenceRate', 'potentialAmount', 'contributingLabels', 'isLikelyOneOff',
    'commentary',
  ])
  if (!Array.isArray(input.contributingLabels)) invalid('contributingLabelsが不正です')
  if (typeof input.isLikelyOneOff !== 'boolean') invalid('isLikelyOneOffが不正です')
  return {
    id: parseString(input.id, 'id'),
    kind: parseDiagnosisKind(input.kind),
    category: parseAiCategory(input.category),
    currentAmount: parseNumber(input.currentAmount, 'currentAmount'),
    baselineAmount: parseNullableNumber(input.baselineAmount, 'baselineAmount'),
    differenceAmount: parseNumber(input.differenceAmount, 'differenceAmount'),
    differenceRate: parseNullableNumber(input.differenceRate, 'differenceRate'),
    potentialAmount: parseNullableNumber(input.potentialAmount, 'potentialAmount'),
    contributingLabels: input.contributingLabels.map((label) =>
      parseString(label, 'contributingLabels')
    ),
    isLikelyOneOff: input.isLikelyOneOff,
    commentary: parseString(input.commentary, 'commentary'),
  }
}

function parseNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${name}が不正です`)
  return value
}

function parseNonnegativeInteger(value: unknown, name: string): number {
  const number = parseNumber(value, name)
  if (!Number.isSafeInteger(number) || number < 0) invalid(`${name}が不正です`)
  return number
}

function parseNullableNumber(value: unknown, name: string): number | null {
  return value === null ? null : parseNumber(value, name)
}

function parseAiCategory(value: unknown): AiCategory {
  const category = parseString(value, 'category')
  if (!AI_CATEGORY_SET.has(category)) invalid('categoryが不正です')
  return category as AiCategory
}

function parseDiagnosisKind(value: unknown): DiagnosisViewItem['kind'] {
  if (value !== 'increase' && value !== 'positive' && value !== 'suggestion') {
    invalid('kindが不正です')
  }
  return value
}

function parseDataSufficiency(value: unknown): AiDiagnosisView['dataSufficiency'] {
  if (value !== 'current_only' && value !== 'reference' && value !== 'full') {
    invalid('dataSufficiencyが不正です')
  }
  return value
}
