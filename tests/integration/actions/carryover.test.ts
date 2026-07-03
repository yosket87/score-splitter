import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import {
  clearApiMocks,
  mockRecordsApi,
} from '../../../tests/mocks/api'
import { mockRedirect, mockRevalidatePath } from '../../../tests/mocks/next'
import {
  createFormData,
  mockAuthenticatedSession,
  mockUnauthenticatedSession,
} from '../../../tests/mocks/helpers'
import {
  createCarryover,
  deleteCarryover,
  getCarryoversByMonth,
  toggleCarryoverCleared,
  updateCarryover,
} from '@/app/actions/carryover'

describe('carryover actions', () => {
  beforeEach(() => {
    clearApiMocks()
    mockRevalidatePath.mockClear()
    vi.clearAllMocks()
    mockAuthenticatedSession()
  })

  it('指定月の繰越をAPIから取得する', async () => {
    const carryovers = [
      {
        id: 'carryover-1',
        month: '202601',
        label: '立替',
        amount: -10000,
        person: 'husband' as const,
        isCleared: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]
    mockRecordsApi.getCarryoversByMonth.mockResolvedValueOnce(carryovers)

    const result = await getCarryoversByMonth('202601')

    expect(mockRecordsApi.getCarryoversByMonth).toHaveBeenCalledWith('202601')
    expect(result).toEqual({ success: true, data: carryovers })
  })

  it('無効セッション時はログインへリダイレクトしてAPIを呼ばない', async () => {
    mockUnauthenticatedSession()

    await expect(getCarryoversByMonth('202601')).rejects.toThrow(
      'NEXT_REDIRECT:/login'
    )

    expect(mockRedirect).toHaveBeenCalledWith('/login')
    expect(mockRecordsApi.getCarryoversByMonth).not.toHaveBeenCalled()
  })

  it('繰越作成時は入力金額を負数にしてAPIへ渡す', async () => {
    const carryover = {
      id: 'carryover-1',
      month: '202601',
      label: '立替',
      amount: -10000,
      person: 'husband' as const,
      isCleared: true,
      createdAt: '2026-01-01T00:00:00Z',
    }
    mockRecordsApi.createCarryover.mockResolvedValueOnce(carryover)

    const result = await createCarryover(
      createFormData({
        month: '202601',
        label: '立替',
        amount: 10000,
        person: 'husband',
        is_cleared: 'true',
      })
    )

    expect(mockRecordsApi.createCarryover).toHaveBeenCalledWith({
      month: '202601',
      label: '立替',
      amount: -10000,
      person: 'husband',
      isCleared: true,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true, data: carryover })
  })

  it('バリデーションエラー時はAPIを呼ばない', async () => {
    const result = await createCarryover(
      createFormData({
        month: '202601',
        label: '',
        amount: 10000,
        person: 'husband',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('項目名を入力してください')
    expect(mockRecordsApi.createCarryover).not.toHaveBeenCalled()
  })

  it('繰越を更新する', async () => {
    const carryover = {
      id: 'carryover-1',
      month: '202601',
      label: '更新後',
      amount: -5000,
      person: 'wife' as const,
      isCleared: false,
      createdAt: '2026-01-01T00:00:00Z',
    }
    mockRecordsApi.updateCarryover.mockResolvedValueOnce(carryover)

    const result = await updateCarryover(
      'carryover-1',
      createFormData({
        month: '202601',
        label: '更新後',
        amount: 5000,
        person: 'wife',
        is_cleared: 'false',
      })
    )

    expect(mockRecordsApi.updateCarryover).toHaveBeenCalledWith('carryover-1', {
      month: '202601',
      label: '更新後',
      amount: -5000,
      person: 'wife',
      isCleared: false,
    })
    expect(result).toEqual({ success: true, data: carryover })
  })

  it('繰越の清算フラグを更新する', async () => {
    mockRecordsApi.toggleCarryoverCleared.mockResolvedValueOnce(undefined)

    const result = await toggleCarryoverCleared('carryover-1', true)

    expect(mockRecordsApi.toggleCarryoverCleared).toHaveBeenCalledWith('carryover-1', true)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true })
  })

  it('繰越を削除する', async () => {
    mockRecordsApi.deleteCarryover.mockResolvedValueOnce(undefined)

    const result = await deleteCarryover('carryover-1')

    expect(mockRecordsApi.deleteCarryover).toHaveBeenCalledWith('carryover-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(result).toEqual({ success: true })
  })
})
