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
  listMonthlyAmounts: vi.fn(),
}))

vi.mock('../../../../cloudflare/worker/src/copy-month', () => ({
  copyMonthData: vi.fn(),
  getCopyMonthPreview: vi.fn(),
}))

vi.mock('../../../../cloudflare/worker/src/waitlist', () => ({
  registerWaitlistEntry: vi.fn(),
}))

import { getDatabase, getRuntime, isWorkerApiMockEnabled } from '@/lib/api/backend'
import * as backend from '@/lib/api/backend'
import { apiRequest, ApiError } from '@/lib/api/client'
import {
  copyMonthData as copyMonthDataInD1,
  getCopyMonthPreview as getCopyMonthPreviewFromD1,
} from '../../../../cloudflare/worker/src/copy-month'
import { listMonthlyAmounts } from '../../../../cloudflare/worker/src/records'
import { registerWaitlistEntry } from '../../../../cloudflare/worker/src/waitlist'
import { copyMonthData, getCopyMonthPreview } from '@/lib/api/copy-month'
import { getMonthlyAmounts } from '@/lib/api/monthly-summary'
import { registerWaitlist } from '@/lib/api/waitlist'
import type { CopyMonthOptions, CopyMonthPreview, CopyMonthResult } from '@/types'

const fakeDb = {} as D1DatabaseLike
const fakeRuntime = {} as Runtime

afterEach(() => {
  vi.resetAllMocks()
})

describe('月次・コピー・waitlistのD1直接アクセス', () => {
  it('未知のD1例外は内部情報を隠したApiErrorへ変換する', async () => {
    useDirectDatabase()
    const error = new Error('D1 connection failed: secret detail')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(listMonthlyAmounts).mockRejectedValue(error)

    await expect(getMonthlyAmounts()).rejects.toEqual(new ApiError('内部エラーが発生しました', 500))
    expect(consoleError).toHaveBeenCalledWith('D1操作中に予期しないエラーが発生しました', error)
  })

  it('月別金額一覧はHTTPではなくD1操作を呼ぶ', async () => {
    useDirectDatabase()
    const amounts = {
      incomes: [{ month: '202609', amount: 300_000 }],
      expenses: [{ month: '202609', amount: -120_000 }],
    }
    vi.mocked(listMonthlyAmounts).mockResolvedValue(amounts)

    await expect(getMonthlyAmounts()).resolves.toEqual(amounts)

    expect(listMonthlyAmounts).toHaveBeenCalledWith(fakeDb)
    expect(getRuntime).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('月コピープレビューはHTTPではなくD1操作を呼ぶ', async () => {
    useDirectDatabase()
    const preview: CopyMonthPreview = {
      sourceMonth: '202608',
      targetMonth: '202609',
      items: [],
      carryoverCount: 0,
      existingCount: 0,
    }
    vi.mocked(getCopyMonthPreviewFromD1).mockResolvedValue(preview)

    await expect(getCopyMonthPreview('202608', '202609')).resolves.toEqual(preview)

    expect(getCopyMonthPreviewFromD1).toHaveBeenCalledWith(fakeDb, '202608', '202609')
    expect(getRuntime).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['コピー元', '2026-08', '202609'],
    ['コピー先', '202608', '2026-09'],
  ])('月コピープレビューは不正な%s月をD1へ渡さない', async (_, sourceMonth, targetMonth) => {
    useDirectDatabase()

    await expect(getCopyMonthPreview(sourceMonth, targetMonth)).rejects.toMatchObject({
      message: 'monthが不正です',
      status: 400,
    })

    expect(getCopyMonthPreviewFromD1).not.toHaveBeenCalled()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('月コピーはDBとRuntimeをD1操作へ渡す', async () => {
    useDirectDatabase()
    const options: CopyMonthOptions = {
      sourceMonth: '202608',
      targetMonth: '202609',
      mode: 'add',
      selectedItems: [],
      includeCarryover: false,
    }
    const result: CopyMonthResult = {
      success: true,
      copied: { incomes: 0, expenses: 0, carryovers: 0 },
      skipped: { incomes: 0, expenses: 0, carryovers: 0 },
    }
    vi.mocked(copyMonthDataInD1).mockResolvedValue(result)

    await expect(copyMonthData(options)).resolves.toEqual(result)

    expect(copyMonthDataInD1).toHaveBeenCalledWith(fakeDb, fakeRuntime, options)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('waitlist登録はDBとRuntimeをD1操作へ渡し、公開契約はvoidを維持する', async () => {
    useDirectDatabase()
    const input = {
      email: 'test@example.com',
      priceIntent: 'free_only' as const,
      simulatorUsed: true,
    }
    vi.mocked(registerWaitlistEntry).mockResolvedValue({ registered: true })

    await expect(registerWaitlist(input)).resolves.toBeUndefined()

    expect(registerWaitlistEntry).toHaveBeenCalledWith(fakeDb, fakeRuntime, input)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('USE_MOCKS=trueのwaitlist登録はHTTP経路だけを使う', async () => {
    vi.mocked(isWorkerApiMockEnabled).mockReturnValue(true)
    vi.mocked(apiRequest).mockResolvedValue(undefined)
    const runD1Operation = vi.spyOn(backend, 'runD1Operation')
    const input = {
      email: 'test@example.com',
      priceIntent: 'paid_ok' as const,
      simulatorUsed: false,
    }

    await expect(registerWaitlist(input)).resolves.toBeUndefined()

    expect(apiRequest).toHaveBeenCalledWith('waitlist', { method: 'POST', body: input })
    expect(getDatabase).not.toHaveBeenCalled()
    expect(getRuntime).not.toHaveBeenCalled()
    expect(registerWaitlistEntry).not.toHaveBeenCalled()
    expect(runD1Operation).not.toHaveBeenCalled()
  })
})

function useDirectDatabase(): void {
  vi.mocked(isWorkerApiMockEnabled).mockReturnValue(false)
  vi.mocked(getDatabase).mockReturnValue(fakeDb)
  vi.mocked(getRuntime).mockReturnValue(fakeRuntime)
}
