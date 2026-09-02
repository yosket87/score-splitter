import { afterEach, describe, expect, it, vi } from 'vitest'
import type { D1DatabaseLike } from '../../../../cloudflare/worker/src/d1'

vi.mock('server-only', () => ({}))
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  getDatabase,
  getRuntime,
  isWorkerApiMockEnabled,
} from '@/lib/api/backend'

const fakeDb = {
  batch: vi.fn(),
  prepare: vi.fn(),
} as unknown as D1DatabaseLike

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
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
})
