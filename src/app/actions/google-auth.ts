'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revokeGoogleSessions } from '@/lib/api/google-auth'
export async function logoutAllGoogleSessions(_state: { error?: string }): Promise<{ error?: string }> {
  void _state
  const cookieStore = await cookies()
  const token = cookieStore.get('household_session')?.value
  if (!token) return { error: 'ログインし直してください。' }
  try { await revokeGoogleSessions(token) }
  catch { return { error: 'ログアウトできませんでした。時間をおいてもう一度お試しください。' } }
  cookieStore.delete('household_session')
  redirect('/login')
}
