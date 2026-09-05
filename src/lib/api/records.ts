import 'server-only'
import { assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { householdSessionToken } from './household-session'
import { z } from 'zod'
import { getDatabase, getRuntime, isWorkerApiMockEnabled, runD1Operation } from './backend'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import {
  createRecord,
  deleteRecord,
  listRecordsByMonth,
  patchRecordFlag,
  updateRecord,
} from '../../../cloudflare/worker/src/records'
import { parseMonth } from '../../../cloudflare/worker/src/validation'
import type { Carryover, Expense, Income } from '@/types'

const personSchema = z.enum(['husband', 'wife'])

const entryRecordBaseFields = {
  id: z.string(),
  month: z.string(),
  label: z.string(),
  amount: z.number(),
  person: personSchema,
  createdAt: z.string().optional(),
}

const incomeSchema: z.ZodType<Income> = z.object(entryRecordBaseFields)

const expenseSchema: z.ZodType<Expense> = z.object({
  ...entryRecordBaseFields,
  isCarryover: z.boolean(),
})

const carryoverSchema: z.ZodType<Carryover> = z.object({
  ...entryRecordBaseFields,
  isCleared: z.boolean(),
})

function createEntryApi<T>(
  basePath: string,
  type: 'income' | 'expense' | 'carryover',
  schema: z.ZodType<T>
) {
  const envelopeSchema = apiEnvelopeSchema(schema)
  const listEnvelopeSchema = apiEnvelopeSchema(z.array(schema))

  return {
    async getByMonth(context: HouseholdContext, month: string): Promise<T[]> {
      assertHouseholdContext(context)
      if (!isWorkerApiMockEnabled()) {
        return runD1Operation(
          () => listRecordsByMonth(getDatabase(), context, type, parseMonth(month)) as Promise<T[]>
        )
      }

      const response = await apiRequest<ApiEnvelope<T[]>>(
        `${basePath}?month=${encodeURIComponent(month)}`,
        { responseSchema: listEnvelopeSchema, sessionToken: await householdSessionToken(context) }
      )
      return response.data
    },
    async create(context: HouseholdContext, input: Omit<T, 'id' | 'createdAt'>): Promise<T> {
      assertHouseholdContext(context)
      if (!isWorkerApiMockEnabled()) {
        return runD1Operation(
          () => createRecord(getDatabase(), getRuntime(), context, type, input) as Promise<T>
        )
      }

      const response = await apiRequest<ApiEnvelope<T>>(basePath, {
        method: 'POST',
        sessionToken: await householdSessionToken(context),
        body: input,
        responseSchema: envelopeSchema,
      })
      return response.data
    },
    async update(context: HouseholdContext, id: string, input: Omit<T, 'id' | 'createdAt'>): Promise<T> {
      assertHouseholdContext(context)
      if (!isWorkerApiMockEnabled()) {
        return runD1Operation(
          () => updateRecord(getDatabase(), getRuntime(), context, type, id, input) as Promise<T>
        )
      }

      const response = await apiRequest<ApiEnvelope<T>>(`${basePath}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        sessionToken: await householdSessionToken(context),
        body: input,
        responseSchema: envelopeSchema,
      })
      return response.data
    },
    async remove(context: HouseholdContext, id: string): Promise<void> {
      assertHouseholdContext(context)
      if (!isWorkerApiMockEnabled()) {
        return runD1Operation(() => deleteRecord(getDatabase(), context, type, id))
      }

      await apiRequest(`${basePath}/${encodeURIComponent(id)}`, { method: 'DELETE', sessionToken: await householdSessionToken(context) })
    },
  }
}

const incomeApi = createEntryApi<Income>('/incomes', 'income', incomeSchema)
const expenseApi = createEntryApi<Expense>('/expenses', 'expense', expenseSchema)
const carryoverApi = createEntryApi<Carryover>('/carryovers', 'carryover', carryoverSchema)

export const getIncomesByMonth = incomeApi.getByMonth
export const createIncome = incomeApi.create
export const updateIncome = incomeApi.update
export const deleteIncome = incomeApi.remove

export const getExpensesByMonth = expenseApi.getByMonth
export const createExpense = expenseApi.create
export const updateExpense = expenseApi.update

export async function toggleExpenseCarryover(context: HouseholdContext, id: string, isCarryover: boolean): Promise<void> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() =>
      patchRecordFlag(getDatabase(), getRuntime(), context, 'expense', id, { isCarryover })
    )
  }

  await apiRequest(`/expenses/${encodeURIComponent(id)}/carryover`, {
    method: 'PATCH',
    sessionToken: await householdSessionToken(context),
    body: { isCarryover },
  })
}

export const deleteExpense = expenseApi.remove

export const getCarryoversByMonth = carryoverApi.getByMonth
export const createCarryover = carryoverApi.create
export const updateCarryover = carryoverApi.update

export async function toggleCarryoverCleared(context: HouseholdContext, id: string, isCleared: boolean): Promise<void> {
  assertHouseholdContext(context)
  if (!isWorkerApiMockEnabled()) {
    return runD1Operation(() =>
      patchRecordFlag(getDatabase(), getRuntime(), context, 'carryover', id, { isCleared })
    )
  }

  await apiRequest(`/carryovers/${encodeURIComponent(id)}/cleared`, {
    method: 'PATCH',
    sessionToken: await householdSessionToken(context),
    body: { isCleared },
  })
}

export const deleteCarryover = carryoverApi.remove
