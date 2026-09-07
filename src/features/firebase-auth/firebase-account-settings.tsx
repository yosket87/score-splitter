'use client'

import { useEffect, useState, useTransition } from 'react'
import { linkWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { exchangeFirebaseSession, logoutAllFirebaseSessions } from '@/app/actions/firebase-auth'
import { createFirebaseProvider, firebaseErrorMessage, getFirebaseAuth, type FirebaseLoginProvider } from '@/lib/auth/firebase-client'
import type { FirebaseClientConfig } from '@/lib/auth/firebase-client-config'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function FirebaseAccountSettings({ config, uid, email }: { config: FirebaseClientConfig; uid: string; email: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [linked, setLinked] = useState<string[]>(config.mock ? ['google.com'] : [])
  const { projectId, apiKey, authDomain, googleEnabled, appleEnabled, mock } = config
  useEffect(() => {
    if (mock) return
    return onAuthStateChanged(getFirebaseAuth({ projectId, apiKey, authDomain, googleEnabled, appleEnabled }), user => {
      setLinked(user?.uid === uid ? user.providerData.map(provider => provider.providerId) : [])
    })
  }, [projectId, apiKey, authDomain, googleEnabled, appleEnabled, uid, mock])

  function link(provider: FirebaseLoginProvider) {
    if (!consent) return
    setMessage(null)
    startTransition(async () => {
      try {
        if (mock && process.env.NODE_ENV === 'development') {
          const result = await exchangeFirebaseSession(`mock:${provider}:member-a`, 'refresh')
          if (!result.ok) { setMessage(result.error); return }
          setLinked(previous => [...previous, provider]); setConsent(false); setMessage('ローカル検証用の連携を確認しました。'); return
        }
        const user = getFirebaseAuth(config).currentUser
        if (!user || user.uid !== uid) { setMessage('この端末でログインし直してから連携してください。'); return }
        const before = await exchangeFirebaseSession(await user.getIdToken(), 'refresh')
        if (!before.ok) { setMessage(before.error); return }
        const result = await linkWithPopup(user, createFirebaseProvider(provider, config))
        if (result.user.uid !== uid) throw new Error('本人が一致しません')
        const after = await exchangeFirebaseSession(await result.user.getIdToken(true), 'refresh')
        if (!after.ok) { setMessage(after.error); return }
        setLinked(result.user.providerData.map(item => item.providerId))
        setConsent(false)
        setMessage('連携しました。次回からどちらの方法でも同じ家計を利用できます。')
      } catch (error) { setMessage(firebaseErrorMessage(error)) }
    })
  }

  function logoutAll() {
    startTransition(async () => {
      try {
      const result = await logoutAllFirebaseSessions()
      if (!result.ok) { setMessage(result.error ?? 'ログアウトできませんでした。'); return }
      if (!mock) await signOut(getFirebaseAuth(config)).catch(() => {})
      router.replace('/login')
      router.refresh()
      } catch { setMessage('ログアウトできませんでした。時間をおいてもう一度お試しください。') }
    })
  }

  const available = [{ id: 'google.com' as const, label: 'Google', enabled: googleEnabled }, { id: 'apple.com' as const, label: 'Apple', enabled: appleEnabled }]
  return <section className="mb-6 min-w-0 space-y-4 border-b pb-6">
    <h2 className="text-lg font-bold">ログインアカウント</h2>
    {email && <p className="break-all text-sm text-sub-text">{email}</p>}
    <div className="space-y-2">
      {available.filter(provider => provider.enabled).map(provider => <div key={provider.id} className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">{provider.label}</span>
        {linked.includes(provider.id) ? <span className="text-sm text-sub-text">連携済み</span> : <Button variant="outline" disabled={pending || !consent} onClick={() => link(provider.id)}>{provider.label}を連携</Button>}
      </div>)}
    </div>
    {available.some(provider => provider.enabled && !linked.includes(provider.id)) && <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
      <input type="checkbox" checked={consent} disabled={pending} onChange={event => setConsent(event.target.checked)} className="mt-1 size-4 shrink-0" />
      <span>GoogleとAppleを同じ家計アカウントに連携することに同意します。Appleでメールを非公開にしている場合も、両方のログイン情報が結び付きます。</span>
    </label>}
    {message && <p role="status" className="text-sm leading-relaxed">{message}</p>}
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" className="h-auto min-h-11 whitespace-normal text-left">自分のすべての端末からログアウト</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle className="pr-10 leading-relaxed">すべての端末からログアウトしますか？</DialogTitle>
        <DialogDescription>この端末を含む自分の端末が対象です。パートナーはそのまま利用できます。再び使うときはログインし直してください。</DialogDescription>
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose asChild><Button variant="outline" disabled={pending}>キャンセル</Button></DialogClose>
          <Button variant="destructive" disabled={pending} onClick={logoutAll}>{pending ? 'ログアウト中…' : 'ログアウトする'}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <p className="text-xs leading-relaxed text-sub-text">ログインできなくなった場合は、これまで使っていた信頼できる連絡手段で管理者へ本人確認を依頼してください。</p>
  </section>
}
