import { importX509 } from 'jose'

const CERTIFICATE_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
const RESPONSE_LIMIT = 128 * 1024
const REQUEST_TIMEOUT_MS = 5000
const UNKNOWN_KEY_REFRESH_MS = 30000

export interface FirebaseVerificationDependencies {
  fetch: typeof fetch
  now: () => number
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 本文の読み取りもタイムアウト・サイズ制限の対象にする。
export async function fetchFirebaseJson(
  dependencies: FirebaseVerificationDependencies, url: string, init: RequestInit = {},
  remainingBudgetMs = REQUEST_TIMEOUT_MS,
): Promise<{ data: unknown; headers: Headers }> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('Firebase通信がタイムアウトしました'))
    }, Math.max(0, Math.min(REQUEST_TIMEOUT_MS, remainingBudgetMs)))
  })
  const request = async () => {
    const response = await dependencies.fetch(url, { ...init, redirect: 'error', signal: controller.signal })
    if (!response.ok || response.redirected || !response.body) throw new Error('Firebase応答が不正です')
    const declaredSize = Number(response.headers.get('content-length'))
    if (declaredSize > RESPONSE_LIMIT) throw new Error('Firebase応答が大きすぎます')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > RESPONSE_LIMIT) throw new Error('Firebase応答が大きすぎます')
        chunks.push(value)
      }
    } finally {
      void reader.cancel().catch(() => {})
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { data: JSON.parse(new TextDecoder().decode(bytes)) as unknown, headers: response.headers }
  }
  try { return await Promise.race([request(), timeout]) }
  finally { clearTimeout(timer) }
}

function cacheLifetime(headers: Headers): number {
  const cacheControl = headers.get('cache-control') ?? ''
  if (/(?:^|,)\s*(?:no-store|no-cache)\b/i.test(cacheControl)) return 0
  const match = /(?:^|,)\s*max-age=(\d+)(?:\s*(?:,|$))/i.exec(cacheControl)
  const age = Number(headers.get('age') ?? '0')
  if (!match || !Number.isFinite(age) || age < 0) return 0
  return Math.max(0, Math.min(Number(match[1]) - age, 86400)) * 1000
}

export function createFirebaseKeyResolver(dependencies: FirebaseVerificationDependencies) {
  let cached: { certificates: Record<string, string>; expiresAt: number; fetchedAt: number } | undefined
  let pending: Promise<void> | undefined
  async function refresh() {
    const fetchedAt = dependencies.now()
    const { data, headers } = await fetchFirebaseJson(dependencies, CERTIFICATE_URL)
    if (!isRecord(data) || Object.keys(data).length === 0 || Object.keys(data).length > 20 ||
      Object.values(data).some(value => typeof value !== 'string' || !value.startsWith('-----BEGIN CERTIFICATE-----'))) {
      throw new Error('Firebase署名鍵が不正です')
    }
    cached = { certificates: data as Record<string, string>, fetchedAt, expiresAt: fetchedAt + cacheLifetime(headers) }
  }
  return async (kid: string): Promise<CryptoKey> => {
    const now = dependencies.now()
    if (!cached || now >= cached.expiresAt ||
      (!Object.hasOwn(cached.certificates, kid) && now - cached.fetchedAt >= UNKNOWN_KEY_REFRESH_MS)) {
      pending ??= refresh().finally(() => { pending = undefined })
      await pending
    }
    if (!cached || !Object.hasOwn(cached.certificates, kid)) throw new Error('Firebase署名鍵がありません')
    return importX509(cached.certificates[kid], 'RS256')
  }
}
