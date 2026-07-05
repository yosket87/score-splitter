import { z } from 'zod'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
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

function createEntryApi<T>(basePath: string, schema: z.ZodType<T>) {
  const envelopeSchema = apiEnvelopeSchema(schema)
  const listEnvelopeSchema = apiEnvelopeSchema(z.array(schema))

  return {
    async getByMonth(month: string): Promise<T[]> {
      const response = await apiRequest<ApiEnvelope<T[]>>(
        `${basePath}?month=${encodeURIComponent(month)}`,
        { responseSchema: listEnvelopeSchema }
      )
      return response.data
    },
    async create(input: Omit<T, 'id' | 'createdAt'>): Promise<T> {
      const response = await apiRequest<ApiEnvelope<T>>(basePath, {
        method: 'POST',
        body: input,
        responseSchema: envelopeSchema,
      })
      return response.data
    },
    async update(id: string, input: Omit<T, 'id' | 'createdAt'>): Promise<T> {
      const response = await apiRequest<ApiEnvelope<T>>(`${basePath}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
        responseSchema: envelopeSchema,
      })
      return response.data
    },
    async remove(id: string): Promise<void> {
      await apiRequest(`${basePath}/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }
}

const incomeApi = createEntryApi<Income>('/incomes', incomeSchema)
const expenseApi = createEntryApi<Expense>('/expenses', expenseSchema)
const carryoverApi = createEntryApi<Carryover>('/carryovers', carryoverSchema)

export const getIncomesByMonth = incomeApi.getByMonth
export const createIncome = incomeApi.create
export const updateIncome = incomeApi.update
export const deleteIncome = incomeApi.remove

export const getExpensesByMonth = expenseApi.getByMonth
export const createExpense = expenseApi.create
export const updateExpense = expenseApi.update

export async function toggleExpenseCarryover(id: string, isCarryover: boolean): Promise<void> {
  await apiRequest(`/expenses/${encodeURIComponent(id)}/carryover`, {
    method: 'PATCH',
    body: { isCarryover },
  })
}

export const deleteExpense = expenseApi.remove

export const getCarryoversByMonth = carryoverApi.getByMonth
export const createCarryover = carryoverApi.create
export const updateCarryover = carryoverApi.update

export async function toggleCarryoverCleared(id: string, isCleared: boolean): Promise<void> {
  await apiRequest(`/carryovers/${encodeURIComponent(id)}/cleared`, {
    method: 'PATCH',
    body: { isCleared },
  })
}

export const deleteCarryover = carryoverApi.remove
