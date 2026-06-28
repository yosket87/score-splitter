import { apiRequest } from './client'
import type { Carryover, Expense, Income } from '@/types'

interface ApiData<T> {
  data: T
}

export async function getIncomesByMonth(month: string): Promise<Income[]> {
  const response = await apiRequest<ApiData<Income[]>>(`/incomes?month=${encodeURIComponent(month)}`)
  return response.data
}

export async function createIncome(input: Omit<Income, 'id' | 'createdAt'>): Promise<Income> {
  const response = await apiRequest<ApiData<Income>>('/incomes', {
    method: 'POST',
    body: input,
  })
  return response.data
}

export async function updateIncome(
  id: string,
  input: Omit<Income, 'id' | 'createdAt'>
): Promise<Income> {
  const response = await apiRequest<ApiData<Income>>(`/incomes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  })
  return response.data
}

export async function deleteIncome(id: string): Promise<void> {
  await apiRequest(`/incomes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getExpensesByMonth(month: string): Promise<Expense[]> {
  const response = await apiRequest<ApiData<Expense[]>>(
    `/expenses?month=${encodeURIComponent(month)}`
  )
  return response.data
}

export async function createExpense(input: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> {
  const response = await apiRequest<ApiData<Expense>>('/expenses', {
    method: 'POST',
    body: input,
  })
  return response.data
}

export async function updateExpense(
  id: string,
  input: Omit<Expense, 'id' | 'createdAt'>
): Promise<Expense> {
  const response = await apiRequest<ApiData<Expense>>(`/expenses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
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
  const response = await apiRequest<ApiData<Carryover[]>>(
    `/carryovers?month=${encodeURIComponent(month)}`
  )
  return response.data
}

export async function createCarryover(
  input: Omit<Carryover, 'id' | 'createdAt'>
): Promise<Carryover> {
  const response = await apiRequest<ApiData<Carryover>>('/carryovers', {
    method: 'POST',
    body: input,
  })
  return response.data
}

export async function updateCarryover(
  id: string,
  input: Omit<Carryover, 'id' | 'createdAt'>
): Promise<Carryover> {
  const response = await apiRequest<ApiData<Carryover>>(
    `/carryovers/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: input,
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
