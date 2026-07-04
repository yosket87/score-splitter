import type { Income, Expense, Carryover } from '@/types'
import { mockSessionsApi } from './api'
import { mockCookies } from './next'

// FormDataを生成するヘルパー
export function createFormData(
  data: Record<string, string | number | boolean>
): FormData {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    formData.set(key, String(value))
  })
  return formData
}

export function mockAuthenticatedSession(): void {
  mockCookies.get.mockReturnValue({ value: 'valid-session-token' })
  mockSessionsApi.getSession.mockResolvedValue({
    token: 'valid-session-token',
    person: null,
    authMethod: 'password',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
}

export function mockUnauthenticatedSession(): void {
  mockCookies.get.mockReturnValue(undefined)
  mockSessionsApi.getSession.mockResolvedValue(null)
}

// テスト用の収入データを生成
export function createMockIncome(overrides: Partial<Income> = {}): Income {
  return {
    id: 'test-income-1',
    month: '202601',
    label: 'テスト収入',
    amount: 100000,
    person: 'husband',
    ...overrides,
  }
}

// テスト用の支出データを生成（負の値）
export function createMockExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'test-expense-1',
    month: '202601',
    label: 'テスト支出',
    amount: -50000, // 支出は負の値
    person: 'husband',
    isCarryover: false,
    ...overrides,
  }
}

// テスト用の繰越データを生成（負の値）
export function createMockCarryover(
  overrides: Partial<Carryover> = {}
): Carryover {
  return {
    id: 'test-carryover-1',
    month: '202601',
    label: 'テスト繰越',
    amount: -10000, // 繰越は負の値
    person: 'husband',
    isCleared: false,
    ...overrides,
  }
}

// 複数の収入データを生成
export function createMockIncomes(count: number = 3): Income[] {
  return Array.from({ length: count }, (_, i) =>
    createMockIncome({
      id: `income-${i + 1}`,
      label: `収入${i + 1}`,
      amount: (i + 1) * 100000,
      person: i % 2 === 0 ? 'husband' : 'wife',
    })
  )
}

// 複数の支出データを生成
export function createMockExpenses(count: number = 3): Expense[] {
  return Array.from({ length: count }, (_, i) =>
    createMockExpense({
      id: `expense-${i + 1}`,
      label: `支出${i + 1}`,
      amount: -(i + 1) * 10000,
      person: i % 2 === 0 ? 'husband' : 'wife',
    })
  )
}

// 複数の繰越データを生成
export function createMockCarryovers(count: number = 3): Carryover[] {
  return Array.from({ length: count }, (_, i) =>
    createMockCarryover({
      id: `carryover-${i + 1}`,
      label: `繰越${i + 1}`,
      amount: -(i + 1) * 5000,
      person: i % 2 === 0 ? 'husband' : 'wife',
    })
  )
}
