'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup, signOut } from 'firebase/auth'
import { exchangeFirebaseSession } from '@/app/actions/firebase-auth'
import { getFirebaseAuth, createFirebaseProvider, firebaseErrorMessage, type FirebaseLoginProvider } from '@/lib/auth/firebase-client'
import type { FirebaseClientConfig } from '@/lib/auth/firebase-client-config'
import { Button } from '@/components/ui/button'

export function FirebaseLogin({ config }: { config: FirebaseClientConfig }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function login(provider: FirebaseLoginProvider) {
    setMessage(null)
    startTransition(async () => {
      try {
        if (config.mock && process.env.NODE_ENV === 'development') {
          const result = await exchangeFirebaseSession(`mock:${provider}:member-a`, 'login')
          if (!result.ok) { setMessage(result.error); return }
          router.replace(result.destination); router.refresh(); return
        }
        const auth = getFirebaseAuth(config)
        const credential = await signInWithPopup(auth, createFirebaseProvider(provider, config))
        const result = await exchangeFirebaseSession(await credential.user.getIdToken(true), 'login')
        if (!result.ok) {
          await signOut(auth)
          setMessage(result.error)
          return
        }
        if (result.destination.includes('recovered')) await signOut(auth)
        router.replace(result.destination)
        router.refresh()
      } catch (error) { setMessage(firebaseErrorMessage(error)) }
    })
  }

  return <div className="space-y-3">
    {config.mock && <p className="text-xs text-sub-text">ローカル画面検証用</p>}
    {config.googleEnabled && <Button type="button" disabled={pending} onClick={() => login('google.com')} className="h-12 w-full rounded-xl text-sm font-bold">Googleでログイン</Button>}
    {config.appleEnabled && <Button type="button" variant="outline" disabled={pending} onClick={() => login('apple.com')} className="h-12 w-full rounded-xl text-sm font-bold">Appleでログイン</Button>}
    {pending && <p role="status" className="text-sm text-sub-text">ログインを確認しています…</p>}
    {message && <p role="alert" className="text-sm leading-relaxed text-destructive">{message}</p>}
  </div>
}
