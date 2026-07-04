import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, apiRequest } from '@/lib/api/client'

describe('apiRequest', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    process.env.CLOUDFLARE_WORKER_API_URL = 'https://worker.example.test/'
    process.env.CLOUDFLARE_WORKER_API_TOKEN = 'worker-secret'
  })

  it('Worker APIへ共有シークレット付きでリクエストする', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: { id: 'income-1' } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiRequest<{ data: { id: string } }>('/incomes?month=202601')

    expect(result).toEqual({ data: { id: 'income-1' } })
    expect(fetchMock).toHaveBeenCalledWith('https://worker.example.test/incomes?month=202601', {
      cache: 'no-store',
      headers: {
        authorization: 'Bearer worker-secret',
      },
    })
  })

  it('JSON bodyを送る場合はcontent-typeを付与する', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/sessions', {
      method: 'POST',
      body: { token: 'a'.repeat(64) },
    })

    expect(fetchMock).toHaveBeenCalledWith('https://worker.example.test/sessions', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        authorization: 'Bearer worker-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token: 'a'.repeat(64) }),
    })
  })

  it('Worker APIエラーをApiErrorとして送出する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: '認証に失敗しました' }, { status: 401 }))
    )

    await expect(apiRequest('/incomes?month=202601')).rejects.toEqual(
      new ApiError('認証に失敗しました', 401)
    )
  })

  it.each([
    ['204', () => new Response(null, { status: 204 })],
    ['空ボディ', () => new Response('', { status: 200 })],
  ])('%sのレスポンスはJSONパースせずundefinedを返す', async (_label, createResponse) => {
    vi.stubGlobal('fetch', vi.fn(async () => createResponse()))

    await expect(apiRequest('/incomes/income-1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('responseSchema指定時に不正なレスポンスはApiErrorとして送出する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: { id: 123 } }))
    )

    await expect(
      apiRequest('/incomes/income-1', {
        responseSchema: z.object({ data: z.object({ id: z.string() }) }),
      })
    ).rejects.toEqual(
      new ApiError('Worker APIレスポンスの形式が不正です', 502)
    )
  })
})
