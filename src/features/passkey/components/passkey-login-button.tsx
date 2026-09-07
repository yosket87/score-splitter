'use client'

import { useState } from 'react'
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { Key } from 'lucide-react'
import {
  generateAuthenticationOptions,
  verifyAuthentication,
} from '@/app/actions/passkeys'

const UNEXPECTED_PASSKEY_AUTH_ERROR =
  'パスキー認証中にエラーが発生しました。時間をおいて再度お試しください。'

export function PasskeyLoginButton() {
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePasskeyLogin() {
    setIsAuthenticating(true)
    setError(null)

    try {
      const optionsResult = await generateAuthenticationOptions()
      if (!optionsResult.success || !optionsResult.data) {
        setError(optionsResult.error ?? '認証オプションの取得に失敗しました')
        return
      }

      const credential = await startAuthentication({
        optionsJSON: optionsResult.data as unknown as PublicKeyCredentialRequestOptionsJSON,
      })

      const verifyResult = await verifyAuthentication(credential)
      if (!verifyResult.success) {
        setError(verifyResult.error ?? '認証に失敗しました')
        return
      }

      window.location.href = '/'
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('パスキー認証がキャンセルされました')
      } else {
        console.error('[PasskeyLoginButton]', err)
        setError(UNEXPECTED_PASSKEY_AUTH_ERROR)
      }
    } finally {
      setIsAuthenticating(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handlePasskeyLogin}
        disabled={isAuthenticating}
        className="relative flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-background/70 px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <Key aria-hidden="true" className="absolute left-3 size-5" />
        {isAuthenticating ? '認証中…' : 'パスキーでログイン'}
      </button>

      {error && (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
          <span className="text-[12px] font-semibold text-destructive">{error}</span>
        </div>
      )}
    </div>
  )
}
