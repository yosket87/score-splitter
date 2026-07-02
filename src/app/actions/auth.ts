'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import {
  createSession,
  deleteSession,
  isAuthenticated as checkSession,
} from '@/lib/webauthn/session'

export async function login(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const password = formData.get('password') as string

  if (!password) {
    return { error: 'パスワードを入力してください' }
  }

  const hashBase64 = process.env.APP_PASSWORD_HASH_BASE64
  if (!hashBase64) {
    return { error: '認証設定が見つかりません' }
  }

  const storedHash = Buffer.from(hashBase64, 'base64').toString('utf-8')
  const isValid = await bcrypt.compare(password, storedHash)
  if (!isValid) {
    return { error: 'パスワードが正しくありません' }
  }

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
