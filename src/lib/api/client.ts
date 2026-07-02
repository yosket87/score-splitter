export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

interface ApiRequestOptions {
  method?: string
  body?: unknown
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
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
  const payload = (await response.json()) as { error?: string }

  if (!response.ok) {
    throw new ApiError(payload.error ?? 'Worker APIリクエストに失敗しました', response.status)
  }

  return payload as T
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
