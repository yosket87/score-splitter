import { z } from 'zod'
import { apiRequest } from './client'
import { apiEnvelopeSchema, type ApiEnvelope } from './types'
import type { Carryover, Expense, Income } from '@/types'

const personSchema = z.enum(['husband', 'wife'])

const incomeSchema: z.ZodType<Income> = z.object({
  id: z.string(),
  month: z.string(),
  label: z.string(),
  amount: z.number(),
  person: personSchema,
  createdAt: z.string().optional(),
})

const expenseSchema: z.ZodType<Expense> = z.object({
  id: z.string(),
  month: z.string(),
  label: z.string(),
  amount: z.number(),
  person: personSchema,
  isCarryover: z.boolean(),
  createdAt: z.string().optional(),
})

const carryoverSchema: z.ZodType<Carryover> = z.object({
  id: z.string(),
  month: z.string(),
  label: z.string(),
  amount: z.number(),
  person: personSchema,
  isCleared: z.boolean(),
  createdAt: z.string().optional(),
})

const incomeEnvelopeSchema = apiEnvelopeSchema(incomeSchema)
const incomeListEnvelopeSchema = apiEnvelopeSchema(z.array(incomeSchema))
const expenseEnvelopeSchema = apiEnvelopeSchema(expenseSchema)
const expenseListEnvelopeSchema = apiEnvelopeSchema(z.array(expenseSchema))
const carryoverEnvelopeSchema = apiEnvelopeSchema(carryoverSchema)
const carryoverListEnvelopeSchema = apiEnvelopeSchema(z.array(carryoverSchema))

export async function getIncomesByMonth(month: string): Promise<Income[]> {
  const response = await apiRequest<ApiEnvelope<Income[]>>(
    `/incomes?month=${encodeURIComponent(month)}`,
    { responseSchema: incomeListEnvelopeSchema }
  )
  return response.data
}

export async function createIncome(input: Omit<Income, 'id' | 'createdAt'>): Promise<Income> {
  const response = await apiRequest<ApiEnvelope<Income>>('/incomes', {
    method: 'POST',
    body: input,
    responseSchema: incomeEnvelopeSchema,
  })
  return response.data
}

export async function updateIncome(
  id: string,
  input: Omit<Income, 'id' | 'createdAt'>
): Promise<Income> {
  const response = await apiRequest<ApiEnvelope<Income>>(`/incomes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    responseSchema: incomeEnvelopeSchema,
  })
  return response.data
}

export async function deleteIncome(id: string): Promise<void> {
  await apiRequest(`/incomes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getExpensesByMonth(month: string): Promise<Expense[]> {
  const response = await apiRequest<ApiEnvelope<Expense[]>>(
    `/expenses?month=${encodeURIComponent(month)}`,
    { responseSchema: expenseListEnvelopeSchema }
  )
  return response.data
}

export async function createExpense(input: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> {
  const response = await apiRequest<ApiEnvelope<Expense>>('/expenses', {
    method: 'POST',
    body: input,
    responseSchema: expenseEnvelopeSchema,
  })
  return response.data
}

export async function updateExpense(
  id: string,
  input: Omit<Expense, 'id' | 'createdAt'>
): Promise<Expense> {
  const response = await apiRequest<ApiEnvelope<Expense>>(`/expenses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    responseSchema: expenseEnvelopeSchema,
  })
  return response.data
}

export async function toggleExpenseCarryover(id: string, isCarryover: boolean): Promise<void> {
  await apiRequest(`/expenses/${encodeURIComponent(id)}/carryover`, {
    method: 'PATCH',
    body: { isCarryover },
  })
}

export async function deleteExpense(id: string): Promise<void> {
  await apiRequest(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getCarryoversByMonth(month: string): Promise<Carryover[]> {
  const response = await apiRequest<ApiEnvelope<Carryover[]>>(
    `/carryovers?month=${encodeURIComponent(month)}`,
    { responseSchema: carryoverListEnvelopeSchema }
  )
  return response.data
}

export async function createCarryover(
  input: Omit<Carryover, 'id' | 'createdAt'>
): Promise<Carryover> {
  const response = await apiRequest<ApiEnvelope<Carryover>>('/carryovers', {
    method: 'POST',
    body: input,
    responseSchema: carryoverEnvelopeSchema,
  })
  return response.data
}

export async function updateCarryover(
  id: string,
  input: Omit<Carryover, 'id' | 'createdAt'>
): Promise<Carryover> {
  const response = await apiRequest<ApiEnvelope<Carryover>>(
    `/carryovers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: input,
      responseSchema: carryoverEnvelopeSchema,
    }
  )
  return response.data
}

export async function toggleCarryoverCleared(id: string, isCleared: boolean): Promise<void> {
  await apiRequest(`/carryovers/${encodeURIComponent(id)}/cleared`, {
    method: 'PATCH',
    body: { isCleared },
  })
}

export async function deleteCarryover(id: string): Promise<void> {
  await apiRequest(`/carryovers/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
