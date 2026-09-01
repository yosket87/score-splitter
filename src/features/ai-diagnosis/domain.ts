import { z } from 'zod'
import { AI_CATEGORIES } from './categories'

export { AI_CATEGORIES, type AiCategory } from './categories'

export const aiCategorySchema = z.enum(AI_CATEGORIES)

export const dataSufficiencySchema = z.enum(['current_only', 'reference', 'full'])
export type DataSufficiency = z.infer<typeof dataSufficiencySchema>

export const diagnosisExpenseSchema = z.object({
  id: z.string(),
  month: z.string(),
  label: z.string(),
  amount: z.number(),
  isCarryover: z.boolean(),
  aiCategory: aiCategorySchema.nullable(),
})
export type DiagnosisExpense = z.infer<typeof diagnosisExpenseSchema>

export const diagnosisContextSchema = z.object({
  targetMonth: z.string(),
  incomes: z.array(z.object({ month: z.string(), amount: z.number() })),
  expenses: z.array(diagnosisExpenseSchema),
  carryovers: z.array(z.object({ month: z.string(), amount: z.number(), isCleared: z.boolean() })),
})
export type DiagnosisContext = z.infer<typeof diagnosisContextSchema>

export const diagnosisCandidateSchema = z.object({
  id: z.string(),
  kind: z.enum(['increase', 'positive', 'suggestion']),
  category: aiCategorySchema,
  currentAmount: z.number(),
  baselineAmount: z.number().nullable(),
  differenceAmount: z.number(),
  differenceRate: z.number().nullable(),
  potentialAmount: z.number().nullable(),
  contributingLabels: z.array(z.string()),
  isLikelyOneOff: z.boolean(),
})
export type DiagnosisCandidate = z.infer<typeof diagnosisCandidateSchema>

const narrativeItemSchema = z.object({ candidateId: z.string(), commentary: z.string() })
export const aiNarrativeResultSchema = z.object({
  summaryText: z.string(),
  notableChanges: z.array(narrativeItemSchema),
  positivePoints: z.array(narrativeItemSchema),
  suggestions: z.array(narrativeItemSchema),
  dataSufficiency: dataSufficiencySchema,
})
export type AiNarrativeResult = z.infer<typeof aiNarrativeResultSchema>

export const diagnosisAnalysisSchema = z.object({
  targetMonth: z.string(),
  currentExpenseTotal: z.number(),
  baselineExpenseAverage: z.number().nullable(),
  unresolvedCarryoverTotal: z.number(),
  dataSufficiency: dataSufficiencySchema,
  notableCandidates: z.array(diagnosisCandidateSchema),
  positiveCandidates: z.array(diagnosisCandidateSchema),
  suggestionCandidates: z.array(diagnosisCandidateSchema),
})
export type DiagnosisAnalysis = z.infer<typeof diagnosisAnalysisSchema>

export const diagnosisViewItemSchema = diagnosisCandidateSchema.extend({ commentary: z.string() })
export type DiagnosisViewItem = z.infer<typeof diagnosisViewItemSchema>

export const aiDiagnosisViewSchema = z.object({
  month: z.string(),
  summaryText: z.string(),
  currentExpenseTotal: z.number(),
  baselineExpenseAverage: z.number().nullable(),
  unresolvedCarryoverTotal: z.number(),
  notableChanges: z.array(diagnosisViewItemSchema),
  positivePoints: z.array(diagnosisViewItemSchema),
  suggestions: z.array(diagnosisViewItemSchema),
  dataSufficiency: dataSufficiencySchema,
})
export type AiDiagnosisView = z.infer<typeof aiDiagnosisViewSchema>

export const categoryAssignmentSchema = z.object({ label: z.string(), category: aiCategorySchema })
export type CategoryAssignment = z.infer<typeof categoryAssignmentSchema>

export const expenseCategoryAssignmentSchema = z.object({
  expenseIds: z.array(z.string()),
  category: aiCategorySchema,
  expectedLabel: z.string(),
}).strict()
export type ExpenseCategoryAssignment = z.infer<typeof expenseCategoryAssignmentSchema>

export type NarrativeInput = DiagnosisAnalysis

export const savedDiagnosisSchema = z.object({
  diagnosis: aiDiagnosisViewSchema,
  inputHash: z.string(),
  analysisVersion: z.string(),
  updatedAt: z.string(),
})
export type SavedDiagnosis = z.infer<typeof savedDiagnosisSchema>

export const diagnosisSnapshotSchema = z.object({ diagnosis: aiDiagnosisViewSchema.nullable(), stale: z.boolean() })
export type DiagnosisSnapshot = z.infer<typeof diagnosisSnapshotSchema>

export const saveDiagnosisInputSchema = z.object({
  runToken: z.string(),
  inputHash: z.string(),
  analysisVersion: z.string(),
  diagnosis: aiDiagnosisViewSchema,
})
export type SaveDiagnosisInput = z.infer<typeof saveDiagnosisInputSchema>
