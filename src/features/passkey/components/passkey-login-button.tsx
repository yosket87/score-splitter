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
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-sub-text">または</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        type="button"
        onClick={handlePasskeyLogin}
        disabled={isAuthenticating}
        className="w-full h-12 px-5 bg-foreground text-background rounded-full text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
      >
        <Key className="h-4 w-4" />
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
