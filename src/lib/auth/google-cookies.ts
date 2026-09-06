import { z } from 'zod'
import { NextResponse } from 'next/server'
export const attemptCookie = 'google_oauth_attempt'
export const migrationCookie = 'google_migration_request'
const secret = z.string().regex(/^[a-f0-9]{64}$/)
export const attemptCookieSchema = z.object({ id: z.string().min(1).max(128), binding: secret })
export const migrationCookieSchema = z.object({ id: z.string().min(1).max(128), secret, code: secret })
export function parseCookie<T>(value: string | undefined, schema: z.ZodType<T>): T | null {
  try { return schema.parse(JSON.parse(value ?? '')) } catch { return null }
}
export const authCookieOptions = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge })
export function privateResponse(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
export function clearAttempt(response: NextResponse) {
  response.cookies.set(attemptCookie, '', authCookieOptions(0))
  return response
}
export function authUnavailable() {
  return privateResponse(clearAttempt(NextResponse.json({ error: 'この場所からはGoogleログインを開始できません。' }, { status: 400 })))
}
