import { z } from 'zod'
import type { RecordType } from '../../../cloudflare/worker/src/validation'

export class MobileApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
export function unauthorized(): never { throw new MobileApiError(401, 'unauthorized', '認証が必要です') }
export function bearerToken(request: Request): string {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')
  if (!match) return unauthorized()
  return match[1]
}
export const monthSchema = z.string().regex(/^\d{4}(0[1-9]|1[0-2])$/)
const entryBase = { label: z.string().trim().min(1).max(255), amount: z.number().int().min(1).max(999999999), person: z.enum(['husband', 'wife']) }
export function recordInput(type: RecordType, value: unknown, create: boolean) {
  const flags = type === 'expense' ? { isCarryover: z.boolean().optional() } : type === 'carryover' ? { isCleared: z.boolean().optional() } : {}
  const parsed = z.object({ ...entryBase, ...flags, ...(create ? { month: monthSchema } : {}) }).strict().parse(value)
  return { ...parsed, amount: type === 'income' ? parsed.amount : -parsed.amount }
}
export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new MobileApiError(400, 'invalid_input', '入力が不正です')
  const reader = request.body?.getReader()
  if (!reader) throw new MobileApiError(400, 'invalid_input', '入力が不正です')
  let length = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 20 * 1024) {
        await reader.cancel()
        throw new MobileApiError(413, 'body_too_large', '本文が大きすぎます')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    if (error instanceof MobileApiError) throw error
    throw new MobileApiError(400, 'invalid_input', '入力が不正です')
  } finally { reader.releaseLock() }
}
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
