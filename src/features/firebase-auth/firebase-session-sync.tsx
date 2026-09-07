'use client'

import { useEffect, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { onIdTokenChanged, signOut } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/auth/firebase-client'
import type { FirebaseClientConfig } from '@/lib/auth/firebase-client-config'
import { exchangeFirebaseSession } from '@/app/actions/firebase-auth'

export function FirebaseSessionSync({ config }: { config: FirebaseClientConfig }) {
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { projectId, apiKey, authDomain, googleEnabled, appleEnabled, mock } = config
  useEffect(() => {
    if (mock || pathname === '/login' || pathname.startsWith('/auth/') || pathname === '/lp') return
    const auth = getFirebaseAuth({ projectId, apiKey, authDomain, googleEnabled, appleEnabled })
    let disposed = false
    let exchanging = false
    const unsubscribe = onIdTokenChanged(auth, user => {
      if (!user || exchanging || disposed) return
      exchanging = true
      startTransition(async () => {
        try {
          const token = await user.getIdToken()
          if (disposed) return
          const result = await exchangeFirebaseSession(token, 'refresh')
          if (!result.ok && !disposed) {
            await signOut(auth)
            router.refresh()
          }
        } catch {
          // 一時的な通信失敗では次の更新まで待つ。権限はサーバーのsession期限で制御する。
        } finally { exchanging = false }
      })
    })
    // ID tokenの期限切れ自体では通知されないため、開いている画面でも更新を要求する。
    const timer = window.setInterval(() => {
      if (auth.currentUser) void auth.currentUser.getIdToken(true).catch(() => {})
    }, 45 * 60 * 1000)
    return () => { disposed = true; unsubscribe(); window.clearInterval(timer) }
  }, [pathname, router, projectId, apiKey, authDomain, googleEnabled, appleEnabled, mock])
  return null
}
