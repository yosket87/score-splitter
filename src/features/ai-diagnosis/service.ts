import { buildDiagnosisAnalysis, composeDiagnosisView } from './analyze'
import { createDiagnosisInputHash } from './input-hash'
import type {
  AiDiagnosisView,
  DiagnosisContext,
  DiagnosisSnapshot,
  ExpenseCategoryAssignment,
  NarrativeInput,
  SaveDiagnosisInput,
  SavedDiagnosis,
} from './domain'
import type { AiDiagnosisProvider } from './provider'

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
  saveCategories(assignments: ExpenseCategoryAssignment[]): Promise<void>
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
          repository
        )
        const inputHash = await createDiagnosisInputHash(classifiedContext)
        const saved = await repository.getSavedDiagnosis(month)

        if (
          saved?.inputHash === inputHash &&
          saved.analysisVersion === ANALYSIS_VERSION
        ) {
          await repository.releaseLease(month, runToken)
          leaseOwned = false
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
  repository: AiDiagnosisRepository
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
  ]
  if (normalizedLabels.length === 0) return context

  const classifications = await provider.classifyLabels(normalizedLabels)
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
  await repository.saveCategories(assignments)

  return {
    ...context,
    incomes: context.incomes.map((income) => ({ ...income })),
    expenses: context.expenses.map((expense) => {
      if (expense.isCarryover || expense.aiCategory !== null) {
        return { ...expense }
      }
      const normalizedLabel = expense.label
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
      const category = categoriesByLabel.get(normalizedLabel)
      return category === undefined
        ? { ...expense }
        : { ...expense, aiCategory: category }
    }),
    carryovers: context.carryovers.map((carryover) => ({ ...carryover })),
  }
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
