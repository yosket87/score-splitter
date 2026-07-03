import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/webauthn/session'

export default async function RootPage() {
  await requireAuth()

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  redirect(`/${year}/${month}`)
}
