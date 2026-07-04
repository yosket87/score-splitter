import type { ZodType } from 'zod'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

interface ApiRequestOptions<TResponse = unknown> {
  method?: string
  body?: unknown
  responseSchema?: ZodType<TResponse>
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions<T> = {}
): Promise<T> {
  const baseUrl = process.env.CLOUDFLARE_WORKER_API_URL
  const token = process.env.CLOUDFLARE_WORKER_API_TOKEN

  if (!baseUrl || !token) {
    throw new ApiError('Cloudflare Worker API設定が見つかりません', 500)
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
  }
  const init: RequestInit = {
    method: options.method,
    cache: 'no-store',
    headers,
  }

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  const response = await fetch(new URL(path, normalizeBaseUrl(baseUrl)).toString(), init)
  const payload = await readJsonPayload(response)

  if (!response.ok) {
    const error = isErrorPayload(payload) ? payload.error : undefined
    throw new ApiError(error ?? 'Worker APIリクエストに失敗しました', response.status)
  }

  if (payload === undefined) {
    return undefined as T
  }

  if (options.responseSchema) {
    const result = options.responseSchema.safeParse(payload)
    if (!result.success) {
      throw new ApiError('Worker APIレスポンスの形式が不正です', 502)
    }
    return result.data
  }

  return payload as T
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

async function readJsonPayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined
  }

  if (response.headers.get('content-length') === '0') {
    return undefined
  }

  const text = await response.text()
  if (text.trim() === '') {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiError('Worker APIレスポンスの形式が不正です', 502)
  }
}

function isErrorPayload(payload: unknown): payload is { error: string } {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return false
  }

  return typeof payload.error === 'string'
}
