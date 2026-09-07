'use client'
import { useActionState } from 'react'
import { logoutAllGoogleSessions } from '@/app/actions/google-auth'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog'
import { GoogleRecoveryHelp } from './google-login-link'
export function GoogleAccountSettings({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState(logoutAllGoogleSessions, {})
  return <section className="min-w-0 space-y-4 border-b pb-6 mb-6">
    <h2 className="text-lg font-bold">Googleアカウント</h2>
    <p className="text-sm">連携中</p>
    <p className="break-all text-sm text-sub-text">{email ?? 'Googleアカウントでログインしています'}</p>
    <p className="text-sm leading-relaxed">自分のすべての端末をログアウトします。パートナーのログイン状態には影響しません。</p>
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" className="min-h-11 h-auto whitespace-normal text-left">自分のすべての端末からログアウト</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle className="pr-10 leading-relaxed">すべての端末からログアウトしますか？</DialogTitle>
        <DialogDescription>この端末を含む自分の端末が対象です。再び使うときはGoogleでログインしてください。パートナーはそのまま利用できます。</DialogDescription>
        <form action={action} className="space-y-4">
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>キャンセル</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>{pending ? 'ログアウト中…' : 'ログアウトする'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <GoogleRecoveryHelp />
  </section>
}
