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

const diagnosisContextSchema: z.ZodType<DiagnosisContext> = z.object({
  targetMonth: z.string(),
  incomes: z.array(z.object({ month: z.string(), amount: z.number() }).strict()),
  expenses: z.array(
    z.object({
      id: z.string(),
      month: z.string(),
      label: z.string(),
      amount: z.number(),
      isCarryover: z.boolean(),
      aiCategory: aiCategorySchema.nullable(),
    }).strict()
  ),
  carryovers: z.array(
    z.object({ month: z.string(), amount: z.number(), isCleared: z.boolean() }).strict()
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
  month: z.string(),
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
}).strict()
const diagnosisViewEnvelopeSchema = z.object({ data: aiDiagnosisViewSchema }).strict()

export async function getDiagnosisContext(month: string): Promise<DiagnosisContext> {
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(month)}/context`, {
    responseSchema: diagnosisContextEnvelopeSchema,
  })
  return response.data
}

export async function getSavedDiagnosis(month: string): Promise<SavedDiagnosis | null> {
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(month)}`, {
    responseSchema: savedDiagnosisEnvelopeSchema,
  })
  return response.data
}

export async function acquireDiagnosisLease(month: string, runToken: string): Promise<void> {
  await apiRequest(`/ai-diagnoses/${encodeURIComponent(month)}/lease`, {
    method: 'POST',
    body: { runToken },
    responseSchema: successSchema,
  })
}

export async function saveExpenseCategories(
  assignments: ExpenseCategoryAssignment[]
): Promise<void> {
  const validatedAssignments = z.array(expenseCategoryAssignmentSchema).parse(assignments)
  await apiRequest('/ai-diagnoses/categories', {
    method: 'PATCH',
    body: { assignments: validatedAssignments },
    responseSchema: successSchema,
  })
}

export async function saveDiagnosis(
  month: string,
  input: SaveDiagnosisInput
): Promise<AiDiagnosisView> {
  const validatedInput = saveDiagnosisInputSchema.parse(input)
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(month)}`, {
    method: 'PUT',
    body: validatedInput,
    responseSchema: diagnosisViewEnvelopeSchema,
  })
  return response.data
}

export async function releaseDiagnosisLease(month: string, runToken: string): Promise<void> {
  await apiRequest(`/ai-diagnoses/${encodeURIComponent(month)}/lease`, {
    method: 'DELETE',
    body: { runToken },
    responseSchema: successSchema,
  })
}
