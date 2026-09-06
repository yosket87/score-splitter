import 'server-only'
import { assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { householdSessionToken } from './household-session'
import { z } from 'zod'
import { apiRequest } from './client'
import { getDatabase, getRuntime, isWorkerApiMockEnabled, runD1Operation } from './backend'
import * as store from '../../../cloudflare/worker/src/ai-diagnosis-store'
import { HttpError } from '../../../cloudflare/worker/src/http'
import {
  AiDiagnosisWireError,
  parseCategoryAssignments, parseDiagnosisView, parseRunTokenInput, parseSaveDiagnosisInput,
} from '@/features/ai-diagnosis/wire'
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

export async function getDiagnosisContext(context: HouseholdContext, month: string): Promise<DiagnosisContext> {
  assertHouseholdContext(context)
  const validatedMonth = monthSchema.parse(month)
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(async () =>
      diagnosisContextSchema.parse(await store.getDiagnosisContext(getDatabase(), context, validatedMonth))
    )
  }
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}/context`, {
    sessionToken: await householdSessionToken(context),
    responseSchema: diagnosisContextEnvelopeSchema,
  })
  return response.data
}

export async function getSavedDiagnosis(context: HouseholdContext, month: string): Promise<SavedDiagnosis | null> {
  assertHouseholdContext(context)
  const validatedMonth = monthSchema.parse(month)
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(async () => {
      const saved = await store.getSavedDiagnosis(getDatabase(), context, validatedMonth)
      if (saved === null) return null
      return savedDiagnosisSchema.parse({ ...saved, diagnosis: parseDiagnosisView(saved.diagnosis) })
    })
  }
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}`, {
    sessionToken: await householdSessionToken(context),
    responseSchema: savedDiagnosisEnvelopeSchema,
  })
  return response.data
}

export async function acquireDiagnosisLease(context: HouseholdContext, month: string, runToken: string): Promise<void> {
  assertHouseholdContext(context)
  const validatedMonth = monthSchema.parse(month)
  if (!isWorkerApiMockEnabled()) {
    return runDiagnosisMutation(async () => {
      const input = parseRunTokenInput({ runToken })
      const lease = await store.acquireDiagnosisLease(getDatabase(), getRuntime(), context, validatedMonth, input.runToken)
      if (!lease.acquired) {
        throw new HttpError(
          lease.reason === 'busy' ? '診断を実行中です' : 'AI診断の利用上限に達しました',
          lease.reason === 'busy' ? 409 : 429
        )
      }
    })
  }
  await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}/lease`, {
    method: 'POST',
    body: { runToken },
    sessionToken: await householdSessionToken(context),
    responseSchema: successSchema,
  })
}

export async function saveExpenseCategories(
  context: HouseholdContext,
  month: string,
  runToken: string,
  assignments: ExpenseCategoryAssignment[]
): Promise<void> {
  assertHouseholdContext(context)
  const validatedMonth = monthSchema.parse(month)
  const validatedRunToken = z.string().min(1).parse(runToken)
  const validatedAssignments = expenseCategoryAssignmentsSchema.parse(assignments)
  if (!isWorkerApiMockEnabled()) {
    return runDiagnosisMutation(async () => {
      const input = parseCategoryAssignments({ month: validatedMonth, runToken: validatedRunToken, assignments: validatedAssignments })
      await store.saveExpenseCategories(getDatabase(), getRuntime(), context, input.month, input.runToken, input.assignments)
    })
  }
  await apiRequest('/ai-diagnoses/categories', {
    method: 'PATCH',
    body: {
      month: validatedMonth,
      runToken: validatedRunToken,
      assignments: validatedAssignments,
    },
    sessionToken: await householdSessionToken(context),
    responseSchema: successSchema,
  })
}

export async function saveDiagnosis(
  context: HouseholdContext,
  month: string,
  input: SaveDiagnosisInput
): Promise<AiDiagnosisView> {
  assertHouseholdContext(context)
  const validatedMonth = monthSchema.parse(month)
  const validatedInput = saveDiagnosisInputSchema.parse(input)
  if (!isWorkerApiMockEnabled()) {
    return runDiagnosisMutation(async () => {
      const parsedInput = parseSaveDiagnosisInput(validatedInput)
      if (parsedInput.diagnosis.month !== validatedMonth) throw new HttpError('診断月が不正です', 400)
      await store.saveDiagnosis(getDatabase(), getRuntime(), context, validatedMonth, parsedInput)
      return parsedInput.diagnosis
    })
  }
  const response = await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}`, {
    method: 'PUT',
    body: validatedInput,
    sessionToken: await householdSessionToken(context),
    responseSchema: diagnosisViewEnvelopeSchema,
  })
  return response.data
}

export async function releaseDiagnosisLease(context: HouseholdContext, month: string, runToken: string): Promise<void> {
  assertHouseholdContext(context)
  const validatedMonth = monthSchema.parse(month)
  if (!isWorkerApiMockEnabled()) {
    return runDiagnosisMutation(async () => {
      const input = parseRunTokenInput({ runToken })
      await store.releaseDiagnosisLease(getDatabase(), context, validatedMonth, input.runToken)
    })
  }
  await apiRequest(`/ai-diagnoses/${encodeURIComponent(validatedMonth)}/lease`, {
    method: 'DELETE',
    body: { runToken },
    sessionToken: await householdSessionToken(context),
    responseSchema: successSchema,
  })
}

function runDiagnosisMutation<T>(operation: () => Promise<T>): Promise<T> {
  return runD1Operation(async () => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof AiDiagnosisWireError) throw new HttpError(error.message, 400)
      const conflictMessages = [
        store.SOURCE_REVISION_CONFLICT_MESSAGE,
        '分類中に支出が変更されました',
        '診断リースが失効しているため保存できません',
        '診断リースが失効しているため解放できません',
      ]
      if (error instanceof Error && conflictMessages.includes(error.message)) {
        throw new HttpError(error.message, 409)
      }
      throw error
    }
  })
}
