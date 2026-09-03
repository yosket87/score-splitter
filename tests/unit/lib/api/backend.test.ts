import { afterEach, describe, expect, it, vi } from 'vitest'
import type { D1DatabaseLike } from '../../../../cloudflare/worker/src/d1'
import { HttpError } from '../../../../cloudflare/worker/src/http'
import { ApiError } from '@/lib/api/client'

vi.mock('server-only', () => ({}))
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  getDatabase,
  getRuntime,
  isWorkerApiMockEnabled,
  runD1Operation,
} from '@/lib/api/backend'

const fakeDb = {
  batch: vi.fn(),
  prepare: vi.fn(),
} as unknown as D1DatabaseLike

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('D1直接アクセス基盤', () => {
  it('通常環境ではCloudflareコンテキストのDB bindingを返す', () => {
    vi.stubEnv('USE_MOCKS', 'false')
    vi.mocked(getCloudflareContext).mockReturnValue({ env: { DB: fakeDb } } as never)

    expect(getDatabase()).toBe(fakeDb)
  })

  it('DB bindingがない場合は設定不足を明示して失敗する', () => {
    vi.mocked(getCloudflareContext).mockReturnValue({ env: {} } as never)

    expect(getDatabase).toThrow('D1データベースの設定が見つかりません')
  })

  it('USE_MOCKS=trueのときだけWorker APIモックを使う', () => {
    vi.stubEnv('USE_MOCKS', 'true')

    expect(isWorkerApiMockEnabled()).toBe(true)
  })

  it('USE_MOCKSがtrue以外ではWorker APIモックを使わない', () => {
    vi.stubEnv('USE_MOCKS', 'TRUE')

    expect(isWorkerApiMockEnabled()).toBe(false)
  })

  it('D1操作用のRuntimeを返す', () => {
    const runtime = getRuntime()

    expect(runtime.now()).toBeInstanceOf(Date)
    expect(runtime.randomUUID()).toEqual(expect.any(String))
  })

  it('モジュール読み込み時にはCloudflareコンテキストを取得しない', async () => {
    vi.resetModules()
    const cloudflare = await import('@opennextjs/cloudflare')
    vi.mocked(cloudflare.getCloudflareContext).mockClear()

    await import('@/lib/api/backend')

    expect(cloudflare.getCloudflareContext).not.toHaveBeenCalled()
  })

  it('D1操作が成功した場合は戻り値をそのまま返す', async () => {
    await expect(runD1Operation(async () => ({ id: 'income-1' }))).resolves.toEqual({
      id: 'income-1',
    })
  })

  it('D1操作のHttpErrorを同じ内容のApiErrorへ変換する', async () => {
    await expect(
      runD1Operation(async () => {
        throw new HttpError('対象データが見つかりません', 404)
      })
    ).rejects.toEqual(new ApiError('対象データが見つかりません', 404))
  })

  it('D1操作の未知の例外はログ出力して汎用ApiErrorへ変換する', async () => {
    const error = new Error('D1 connection failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      runD1Operation(async () => {
        throw error
      })
    ).rejects.toEqual(new ApiError('内部エラーが発生しました', 500))

    expect(consoleError).toHaveBeenCalledWith('D1操作中に予期しないエラーが発生しました', error)
  })
})
