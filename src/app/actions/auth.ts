'use server'

import { createHash } from 'crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
} from '@/lib/api/login-attempts'
import {
  createSession,
  deleteSession,
  isAuthenticated as checkSession,
} from '@/lib/webauthn/session'

const LOGIN_LOCKED_MESSAGE =
  '試行回数が上限に達しました。しばらくしてからお試しください'

export async function login(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const password = formData.get('password') as string

  if (!password) {
    return { error: 'パスワードを入力してください' }
  }

  const loginAttemptKey = await createLoginAttemptKey()
  const rateLimit = await checkLoginRateLimit(loginAttemptKey)
  if (!rateLimit.allowed) {
    return { error: LOGIN_LOCKED_MESSAGE }
  }

  const hashBase64 = process.env.APP_PASSWORD_HASH_BASE64
  if (!hashBase64) {
    return { error: '認証設定が見つかりません' }
  }

  const storedHash = Buffer.from(hashBase64, 'base64').toString('utf-8')
  const isValid = await bcrypt.compare(password, storedHash)
  if (!isValid) {
    await recordFailedLoginAttempt(loginAttemptKey)
    return { error: 'パスワードが正しくありません' }
  }

  await resetLoginAttempts(loginAttemptKey)
  await createSession(null, 'password')
  redirect('/')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}

export async function isAuthenticated(): Promise<boolean> {
  return checkSession()
}

async function createLoginAttemptKey(): Promise<string> {
  const headerStore = await headers()
  const cookieStore = await cookies()
  const forwardedFor = headerStore.get('x-forwarded-for')
  const ip =
    forwardedFor?.split(',')[0]?.trim() ||
    headerStore.get('x-real-ip')?.trim() ||
    'unknown-ip'
  const sessionCookie = cookieStore.get('household_session')?.value
  const fallback = sessionCookie ?? headerStore.get('user-agent') ?? 'unknown-agent'

  return createHash('sha256').update(`${ip}:${fallback}`).digest('hex')
}
