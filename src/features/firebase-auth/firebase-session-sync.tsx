'use client'

import { useEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { onIdTokenChanged, signOut, type User } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/auth/firebase-client'
import type { FirebaseClientConfig } from '@/lib/auth/firebase-client-config'
import { exchangeFirebaseSession } from '@/app/actions/firebase-auth'

export function FirebaseSessionSync({ config }: { config: FirebaseClientConfig }) {
  const successfulToken = useRef<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { projectId, apiKey, authDomain, googleEnabled, appleEnabled, mock } = config
  useEffect(() => {
    if (mock || pathname === '/login' || pathname.startsWith('/auth/') || pathname === '/lp') {
      successfulToken.current = null
      return
    }
    const auth = getFirebaseAuth({ projectId, apiKey, authDomain, googleEnabled, appleEnabled })
    let disposed = false
    let exchanging = false
    let retryTimer: number | undefined
    const syncSession = (user: User | null) => {
      if (!user) {
        successfulToken.current = null
        return
      }
      if (exchanging || disposed) return
      window.clearTimeout(retryTimer)
      exchanging = true
      startTransition(async () => {
        try {
          const token = await user.getIdToken()
          if (disposed || successfulToken.current === token) return
          const result = await exchangeFirebaseSession(token, 'refresh')
          if (disposed) return
          if (result.ok) successfulToken.current = token
          if (!result.ok) {
            if (result.reason === 'reauthenticate') {
              await signOut(auth)
              router.refresh()
            } else {
              scheduleRetry()
            }
          }
        } catch {
          // 一時障害ではSDK状態を保ち、D1のsession期限内で再試行する。
          scheduleRetry()
        } finally { exchanging = false }
      })
    }
    const scheduleRetry = () => {
      if (disposed) return
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => syncSession(auth.currentUser), 60_000)
    }
    const unsubscribe = onIdTokenChanged(auth, syncSession)
    // ID tokenの期限切れ自体では通知されないため、開いている画面でも更新を要求する。
    const timer = window.setInterval(() => {
      if (auth.currentUser) void auth.currentUser.getIdToken(true).catch(() => {})
    }, 45 * 60 * 1000)
    return () => { disposed = true; unsubscribe(); window.clearInterval(timer); window.clearTimeout(retryTimer) }
  }, [pathname, router, projectId, apiKey, authDomain, googleEnabled, appleEnabled, mock])
  return null
}
