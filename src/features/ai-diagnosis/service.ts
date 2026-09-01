import { buildDiagnosisAnalysis, composeDiagnosisView } from './analyze'
import { createDiagnosisInputHash } from './input-hash'
import type {
  AiDiagnosisView,
  CategoryAssignment,
  DiagnosisContext,
  DiagnosisSnapshot,
  ExpenseCategoryAssignment,
  NarrativeInput,
  SaveDiagnosisInput,
  SavedDiagnosis,
} from './domain'
import type { AiDiagnosisProvider } from './provider'
import {
  AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES,
  AI_DIAGNOSIS_MAX_CLASSIFICATION_LABELS,
} from './limits'

const ANALYSIS_VERSION = 'v1'

export class NoActualExpensesError extends Error {
  constructor() {
    super('診断できる実支出データがありません。')
    this.name = 'NoActualExpensesError'
  }
}

export interface AiDiagnosisRepository {
  getContext(month: string): Promise<DiagnosisContext>
  getSavedDiagnosis(month: string): Promise<SavedDiagnosis | null>
  acquireLease(month: string, runToken: string): Promise<void>
  saveCategories(
    month: string,
    runToken: string,
    assignments: ExpenseCategoryAssignment[]
  ): Promise<void>
  saveDiagnosis(month: string, input: SaveDiagnosisInput): Promise<AiDiagnosisView>
  releaseLease(month: string, runToken: string): Promise<void>
}

export interface AiDiagnosisServiceDependencies {
  repository: AiDiagnosisRepository
  provider: AiDiagnosisProvider
  randomUUID: () => string
  logReleaseError: (error: unknown) => void
}

export interface AiDiagnosisService {
  load(month: string): Promise<DiagnosisSnapshot>
  run(month: string): Promise<AiDiagnosisView>
}

export function createAiDiagnosisService(
  dependencies: AiDiagnosisServiceDependencies
): AiDiagnosisService {
  const { repository, provider } = dependencies

  return {
    async load(month) {
      const context = await repository.getContext(month)
      const inputHash = await createDiagnosisInputHash(context)
      const saved = await repository.getSavedDiagnosis(month)

      if (saved === null) return { diagnosis: null, stale: false }
      return {
        diagnosis: saved.diagnosis,
        stale:
          saved.inputHash !== inputHash ||
          saved.analysisVersion !== ANALYSIS_VERSION,
      }
    },

    async run(month) {
      const runToken = dependencies.randomUUID()
      await repository.acquireLease(month, runToken)
      let leaseOwned = true

      try {
        const context = await repository.getContext(month)
        assertCurrentMonthHasActualExpenses(context)
        const classifiedContext = await classifyUnknownLabels(
          context,
          provider,
          repository,
          runToken
        )
        const inputHash = await createDiagnosisInputHash(classifiedContext)
        const saved = await repository.getSavedDiagnosis(month)

        if (
          saved?.inputHash === inputHash &&
          saved.analysisVersion === ANALYSIS_VERSION
        ) {
          leaseOwned = false
          try {
            await repository.releaseLease(month, runToken)
          } catch (releaseError) {
            dependencies.logReleaseError(releaseError)
          }
          return saved.diagnosis
        }

        const analysis = buildDiagnosisAnalysis(classifiedContext)
        const narrative = await provider.generateNarrative(
          toNarrativeInput(analysis)
        )
        const diagnosis = composeDiagnosisView(analysis, narrative)
        const result = await repository.saveDiagnosis(month, {
          runToken,
          inputHash,
          analysisVersion: ANALYSIS_VERSION,
          diagnosis,
        })
        leaseOwned = false
        return result
      } catch (error) {
        if (leaseOwned) {
          try {
            await repository.releaseLease(month, runToken)
          } catch (releaseError) {
            dependencies.logReleaseError(releaseError)
          }
        }
        throw error
      }
    },
  }
}

function assertCurrentMonthHasActualExpenses(context: DiagnosisContext): void {
  if (
    !context.expenses.some(
      (expense) =>
        expense.month === context.targetMonth && !expense.isCarryover
    )
  ) {
    throw new NoActualExpensesError()
  }
}

async function classifyUnknownLabels(
  context: DiagnosisContext,
  provider: AiDiagnosisProvider,
  repository: AiDiagnosisRepository,
  runToken: string
): Promise<DiagnosisContext> {
  const unknownExpenses = context.expenses
    .filter((expense) => !expense.isCarryover && expense.aiCategory === null)
    .map((expense) => ({
      expense,
      normalizedLabel: expense.label
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' '),
    }))
  const normalizedLabels = [
    ...new Set(unknownExpenses.map(({ normalizedLabel }) => normalizedLabel)),
  ].sort()
  if (normalizedLabels.length === 0) return context

  const labelsForProvider = normalizedLabels.slice(
    0,
    AI_DIAGNOSIS_MAX_CLASSIFICATION_LABELS
  )
  const overflowLabels = normalizedLabels.slice(
    AI_DIAGNOSIS_MAX_CLASSIFICATION_LABELS
  )
  const classifications: CategoryAssignment[] = [
    ...(await provider.classifyLabels(labelsForProvider)),
    ...overflowLabels.map((label) => ({ label, category: 'other' as const })),
  ]
  const categoriesByLabel = new Map(
    classifications.map(({ label, category }) => [label, category])
  )
  if (
    classifications.length !== normalizedLabels.length ||
    categoriesByLabel.size !== classifications.length ||
    normalizedLabels.some((label) => !categoriesByLabel.has(label))
  ) {
    throw new Error('分類結果が入力ラベルと完全に対応していません。')
  }

  const assignments = unknownExpenses.reduce<ExpenseCategoryAssignment[]>(
    (groups, { expense, normalizedLabel }) => {
      const category = categoriesByLabel.get(normalizedLabel)
      if (category === undefined) {
        throw new Error('分類結果が入力ラベルと完全に対応していません。')
      }
      const existingIndex = groups.findIndex(
        (group) =>
          group.category === category && group.expectedLabel === expense.label
      )
      if (existingIndex === -1) {
        return [
          ...groups,
          {
            expenseIds: [expense.id],
            category,
            expectedLabel: expense.label,
          },
        ]
      }
      return groups.map((group, index) =>
        index === existingIndex
          ? { ...group, expenseIds: [...group.expenseIds, expense.id] }
          : group
      )
    },
    []
  )
  for (const batch of createCategoryAssignmentBatches(assignments)) {
    await repository.saveCategories(context.targetMonth, runToken, batch)
  }

  return repository.getContext(context.targetMonth)
}

function createCategoryAssignmentBatches(
  assignments: ExpenseCategoryAssignment[]
): ExpenseCategoryAssignment[][] {
  const splitAssignments = assignments.flatMap((assignment) =>
    chunkItems(assignment.expenseIds, AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES).map(
      (expenseIds) => ({ ...assignment, expenseIds })
    )
  )

  return splitAssignments.reduce<ExpenseCategoryAssignment[][]>(
    (batches, assignment) => {
      const lastBatch = batches.at(-1) ?? []
      const lastExpenseCount = lastBatch.reduce(
        (count, item) => count + item.expenseIds.length,
        0
      )
      if (
        lastBatch.length === 0 ||
        lastExpenseCount + assignment.expenseIds.length >
          AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES
      ) {
        return [...batches, [assignment]]
      }
      return [
        ...batches.slice(0, -1),
        [...lastBatch, assignment],
      ]
    },
    []
  )
}

function chunkItems<T>(items: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size)
  )
}

function toNarrativeInput(analysis: NarrativeInput): NarrativeInput {
  return {
    ...analysis,
    notableCandidates: analysis.notableCandidates.map((candidate) => ({
      ...candidate,
      contributingLabels: [...candidate.contributingLabels],
    })),
    positiveCandidates: analysis.positiveCandidates.map((candidate) => ({
      ...candidate,
      contributingLabels: [...candidate.contributingLabels],
    })),
    suggestionCandidates: analysis.suggestionCandidates.map((candidate) => ({
      ...candidate,
      contributingLabels: [...candidate.contributingLabels],
    })),
  }
}
