import { z } from 'zod'
import { apiRequest } from './client'
import {
  aiCategorySchema,
  dataSufficiencySchema,
  expenseCategoryAssignmentSchema,
  type AiDiagnosisView,
  type DiagnosisContext,
  type ExpenseCategoryAssignment,
  type SaveDiagnosisInput,
  type SavedDiagnosis,
} from '@/features/ai-diagnosis/domain'
import { AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES } from '@/features/ai-diagnosis/limits'

const monthSchema = z.string().regex(/^\d{6}$/).refine((month) => {
  const monthNumber = Number(month.slice(4, 6))
  return monthNumber >= 1 && monthNumber <= 12
}, '月はYYYYMM形式の実在する暦月で指定してください')
const expenseCategoryAssignmentsSchema = z
  .array(expenseCategoryAssignmentSchema)
  .superRefine((assignments, context) => {
    const expenseCount = assignments.reduce(
      (count, assignment) => count + assignment.expenseIds.length,
      0
    )
    if (expenseCount > AI_DIAGNOSIS_MAX_CATEGORY_EXPENSES) {
      context.addIssue({
        code: 'custom',
        message: '一度に分類できる支出は100件までです',
      })
    }
    const expenseIds = assignments.flatMap((assignment) => assignment.expenseIds)
    if (new Set(expenseIds).size !== expenseIds.length) {
      context.addIssue({
        code: 'custom',
        message: '支出IDが重複しています',
      })
    }
  })

const diagnosisContextSchema: z.ZodType<DiagnosisContext> = z.object({
  targetMonth: monthSchema,
  sourceRevision: z.number().int().nonnegative(),
  incomes: z.array(z.object({ month: monthSchema, amount: z.number() }).strict()),
  expenses: z.array(
    z.object({
      id: z.string(),
      month: monthSchema,
      label: z.string(),
      amount: z.number(),
      isCarryover: z.boolean(),
      aiCategory: aiCategorySchema.nullable(),
    }).strict()
  ),
  carryovers: z.array(
    z.object({ month: monthSchema, amount: z.number(), isCleared: z.boolean() }).strict()
  ),
}).strict()

const diagnosisContextEnvelopeSchema = z.object({ data: diagnosisContextSchema }).strict()

const diagnosisViewItemSchema = z.object({
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
  commentary: z.string(),
}).strict()

const aiDiagnosisViewSchema: z.ZodType<AiDiagnosisView> = z.object({
  month: monthSchema,
  summaryText: z.string(),
  currentExpenseTotal: z.number(),
  baselineExpenseAverage: z.number().nullable(),
  unresolvedCarryoverTotal: z.number(),
  notableChanges: z.array(diagnosisViewItemSchema),
  positivePoints: z.array(diagnosisViewItemSchema),
  suggestions: z.array(diagnosisViewItemSchema),
  dataSufficiency: dataSufficiencySchema,
}).strict()

const savedDiagnosisSchema: z.ZodType<SavedDiagnosis> = z.object({
  diagnosis: aiDiagnosisViewSchema,
  inputHash: z.string(),
  analysisVersion: z.string(),
  updatedAt: z.string(),
}).strict()

const savedDiagnosisEnvelopeSchema = z.object({
  data: savedDiagnosisSchema.nullable(),
}).strict()
const successSchema = z.object({ success: z.literal(true) }).strict()
const saveDiagnosisInputSchema: z.ZodType<SaveDiagnosisInput> = z.object({
  runToken: z.string(),
  inputHash: z.string(),
  analysisVersion: z.string(),
  diagnosis: aiDiagnosisViewSchema,
  expectedSourceRevision: z.number().int().nonnegative(),
}).strict()
const diagnosisViewEnvelopeSchema = z.object({ data: aiDiagnosisViewSchema }).strict()

export async function getDiagnosisContext(month: string): Promise<DiagnosisContext> {
  const validatedMonth = monthSchema.parse(month)
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}/context`, {
    responseSchema: diagnosisContextEnvelopeSchema,
  })
  return response.data
}

export async function getSavedDiagnosis(month: string): Promise<SavedDiagnosis | null> {
  const validatedMonth = monthSchema.parse(month)
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}`, {
    responseSchema: savedDiagnosisEnvelopeSchema,
  })
  return response.data
}

export async function acquireDiagnosisLease(month: string, runToken: string): Promise<void> {
  const validatedMonth = monthSchema.parse(month)
  await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}/lease`, {
    method: 'POST',
    body: { runToken },
    responseSchema: successSchema,
  })
}

export async function saveExpenseCategories(
  month: string,
  runToken: string,
  assignments: ExpenseCategoryAssignment[]
): Promise<void> {
  const validatedMonth = monthSchema.parse(month)
  const validatedRunToken = z.string().min(1).parse(runToken)
  const validatedAssignments = expenseCategoryAssignmentsSchema.parse(assignments)
  await apiRequest('/ai-diagnoses/categories', {
    method: 'PATCH',
    body: {
      month: validatedMonth,
      runToken: validatedRunToken,
      assignments: validatedAssignments,
    },
    responseSchema: successSchema,
  })
}

export async function saveDiagnosis(
  month: string,
  input: SaveDiagnosisInput
): Promise<AiDiagnosisView> {
  const validatedMonth = monthSchema.parse(month)
  const validatedInput = saveDiagnosisInputSchema.parse(input)
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}`, {
    method: 'PUT',
    body: validatedInput,
    responseSchema: diagnosisViewEnvelopeSchema,
  })
  return response.data
}

export async function releaseDiagnosisLease(month: string, runToken: string): Promise<void> {
  const validatedMonth = monthSchema.parse(month)
  await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}/lease`, {
    method: 'DELETE',
    body: { runToken },
    responseSchema: successSchema,
  })
}
