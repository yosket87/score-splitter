import { afterEach, describe, expect, it, vi } from 'vitest'
import type { D1DatabaseLike, Runtime } from '../../../../cloudflare/worker/src/d1'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/api/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/backend')>()),
  getDatabase: vi.fn(),
  getRuntime: vi.fn(),
  isWorkerApiMockEnabled: vi.fn(),
}))

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiRequest: vi.fn(),
}))

vi.mock('../../../../cloudflare/worker/src/records', () => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  listRecordsByMonth: vi.fn(),
  patchRecordFlag: vi.fn(),
  updateRecord: vi.fn(),
}))

import { getDatabase, getRuntime, isWorkerApiMockEnabled } from '@/lib/api/backend'
import { apiRequest, ApiError } from '@/lib/api/client'
import {
  createCarryover,
  createExpense,
  createIncome,
  deleteCarryover,
  deleteExpense,
  deleteIncome,
  getCarryoversByMonth,
  getExpensesByMonth,
  getIncomesByMonth,
  toggleCarryoverCleared,
  toggleExpenseCarryover,
  updateCarryover,
  updateExpense,
  updateIncome,
} from '@/lib/api/records'
import {
  createRecord,
  deleteRecord,
  listRecordsByMonth,
  patchRecordFlag,
  updateRecord,
} from '../../../../cloudflare/worker/src/records'
import { HttpError } from '../../../../cloudflare/worker/src/http'
import type { Carryover, Expense, Income } from '@/types'

const fakeDb = {} as D1DatabaseLike
const fakeRuntime = {} as Runtime

const income: Income & { createdAt: string } = {
  id: 'income-1',
  month: '202609',
  label: '給料',
  amount: 300_000,
  person: 'husband',
  createdAt: '2026-09-01T00:00:00.000Z',
}

const expense: Expense & { createdAt: string } = {
  id: 'expense-1',
  month: '202609',
  label: '家賃',
  amount: -120_000,
  person: 'wife',
  isCarryover: false,
  createdAt: '2026-09-01T00:00:00.000Z',
}

const carryover: Carryover & { createdAt: string } = {
  id: 'carryover-1',
  month: '202609',
  label: '前月繰越',
  amount: -5_000,
  person: 'husband',
  isCleared: false,
  createdAt: '2026-09-01T00:00:00.000Z',
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('recordsのD1直接アクセス', () => {
  it('D1操作のHttpErrorを公開APIのApiErrorへ変換する', async () => {
    useDirectDatabase()
    vi.mocked(listRecordsByMonth).mockRejectedValue(new HttpError('monthが不正です', 400))

    await expect(getIncomesByMonth('202609')).rejects.toEqual(
      new ApiError('monthが不正です', 400)
    )
  })

  it('一覧取得は不正な月をD1へ渡さない', async () => {
    useDirectDatabase()

    await expect(getIncomesByMonth('2026-09')).rejects.toMatchObject({
      message: 'monthが不正です',
      status: 400,
    })

    expect(listRecordsByMonth).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['収入', getIncomesByMonth, 'income', income],
    ['支出', getExpensesByMonth, 'expense', expense],
    ['繰越', getCarryoversByMonth, 'carryover', carryover],
  ] as const)('通常環境の%s一覧取得はHTTPではなくD1操作を呼ぶ', async (_, getByMonth, type, record) => {
    useDirectDatabase()
    vi.mocked(listRecordsByMonth).mockResolvedValue([record])

    await expect(getByMonth('202609')).resolves.toEqual([record])

    expect(listRecordsByMonth).toHaveBeenCalledWith(fakeDb, type, '202609')
    expect(getRuntime).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['収入', createIncome, 'income', income],
    ['支出', createExpense, 'expense', expense],
    ['繰越', createCarryover, 'carryover', carryover],
  ] as const)('通常環境の%s作成はDBとRuntimeを渡す', async (_, create, type, record) => {
    useDirectDatabase()
    vi.mocked(createRecord).mockResolvedValue(record)
    const input = withoutGeneratedFields(record)

    await expect(create(input as never)).resolves.toEqual(record)

    expect(createRecord).toHaveBeenCalledWith(fakeDb, fakeRuntime, type, input)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['収入', updateIncome, 'income', income],
    ['支出', updateExpense, 'expense', expense],
    ['繰越', updateCarryover, 'carryover', carryover],
  ] as const)('通常環境の%s更新はDBとRuntimeを渡す', async (_, update, type, record) => {
    useDirectDatabase()
    vi.mocked(updateRecord).mockResolvedValue(record)
    const input = withoutGeneratedFields(record)

    await expect(update(record.id, input as never)).resolves.toEqual(record)

    expect(updateRecord).toHaveBeenCalledWith(fakeDb, fakeRuntime, type, record.id, input)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('支出の作成・更新は負のamountをそのままD1操作へ渡す', async () => {
    useDirectDatabase()
    vi.mocked(createRecord).mockResolvedValue(expense)
    vi.mocked(updateRecord).mockResolvedValue(expense)
    const input = withoutGeneratedFields(expense)

    await createExpense(input)
    await updateExpense(expense.id, input)

    expect(createRecord).toHaveBeenCalledWith(
      fakeDb,
      fakeRuntime,
      'expense',
      expect.objectContaining({ amount: -120_000 })
    )
    expect(updateRecord).toHaveBeenCalledWith(
      fakeDb,
      fakeRuntime,
      'expense',
      expense.id,
      expect.objectContaining({ amount: -120_000 })
    )
  })

  it('繰越の作成・更新は負のamountをそのままD1操作へ渡す', async () => {
    useDirectDatabase()
    vi.mocked(createRecord).mockResolvedValue(carryover)
    vi.mocked(updateRecord).mockResolvedValue(carryover)
    const input = withoutGeneratedFields(carryover)

    await createCarryover(input)
    await updateCarryover(carryover.id, input)

    expect(createRecord).toHaveBeenCalledWith(
      fakeDb,
      fakeRuntime,
      'carryover',
      expect.objectContaining({ amount: -5_000 })
    )
    expect(updateRecord).toHaveBeenCalledWith(
      fakeDb,
      fakeRuntime,
      'carryover',
      carryover.id,
      expect.objectContaining({ amount: -5_000 })
    )
  })

  it('支出の繰越フラグ更新はDBとRuntimeを渡す', async () => {
    useDirectDatabase()

    await expect(toggleExpenseCarryover('expense-1', true)).resolves.toBeUndefined()

    expect(patchRecordFlag).toHaveBeenCalledWith(fakeDb, fakeRuntime, 'expense', 'expense-1', {
      isCarryover: true,
    })
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('繰越の清算フラグ更新はDBとRuntimeを渡す', async () => {
    useDirectDatabase()

    await expect(toggleCarryoverCleared('carryover-1', true)).resolves.toBeUndefined()

    expect(patchRecordFlag).toHaveBeenCalledWith(
      fakeDb,
      fakeRuntime,
      'carryover',
      'carryover-1',
      { isCleared: true }
    )
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['収入', deleteIncome, 'income', 'income-1'],
    ['支出', deleteExpense, 'expense', 'expense-1'],
    ['繰越', deleteCarryover, 'carryover', 'carryover-1'],
  ] as const)('通常環境の%s削除はRuntimeなしでD1操作を呼ぶ', async (_, remove, type, id) => {
    useDirectDatabase()

    await expect(remove(id)).resolves.toBeUndefined()

    expect(deleteRecord).toHaveBeenCalledWith(fakeDb, type, id)
    expect(getRuntime).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalled()
  })
})

function useDirectDatabase(): void {
  vi.mocked(isWorkerApiMockEnabled).mockReturnValue(false)
  vi.mocked(getDatabase).mockReturnValue(fakeDb)
  vi.mocked(getRuntime).mockReturnValue(fakeRuntime)
}

function withoutGeneratedFields<T extends { id: string; createdAt?: string }>(
  record: T
): Omit<T, 'id' | 'createdAt'> {
  const { id, createdAt, ...input } = record
  void id
  void createdAt
  return input
}
