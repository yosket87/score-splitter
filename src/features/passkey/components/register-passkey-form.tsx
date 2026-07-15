'use client'

import { useId, useState } from 'react'
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  generateRegistrationOptions,
  verifyRegistration,
} from '@/app/actions/passkeys'
import type { Person } from '@/types'

const UNEXPECTED_PASSKEY_REGISTRATION_ERROR =
  'パスキーの登録中にエラーが発生しました。時間をおいて再度お試しください。'

interface RegisterPasskeyFormProps {
  onRegistered: () => void
}

export function RegisterPasskeyForm({ onRegistered }: RegisterPasskeyFormProps) {
  const formId = useId()
  const [person, setPerson] = useState<Person>('husband')
  const [deviceName, setDeviceName] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegister() {
    setIsRegistering(true)
    setError(null)

    try {
      const optionsResult = await generateRegistrationOptions(person)
      if (!optionsResult.success || !optionsResult.data) {
        setError(optionsResult.error ?? '登録オプションの取得に失敗しました')
        return
      }

      const credential = await startRegistration({
        optionsJSON: optionsResult.data as unknown as PublicKeyCredentialCreationOptionsJSON,
      })

      const verifyResult = await verifyRegistration(
        person,
        credential,
        deviceName || undefined
      )

      if (!verifyResult.success) {
        setError(verifyResult.error ?? '登録の検証に失敗しました')
        return
      }

      setDeviceName('')
      onRegistered()
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('パスキーの登録がキャンセルされました')
      } else {
        console.error('[RegisterPasskeyForm]', err)
        setError(UNEXPECTED_PASSKEY_REGISTRATION_ERROR)
      }
    } finally {
      setIsRegistering(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Person 選択 */}
      <div>
        <label
          id={`${formId}-person-label`}
          className="text-[11px] font-bold tracking-[0.14em] uppercase text-sub-text block mb-2"
        >
          登録する人
        </label>
        <div
          className="flex gap-2"
          role="radiogroup"
          aria-labelledby={`${formId}-person-label`}
        >
          <button
            type="button"
            role="radio"
            aria-checked={person === 'husband'}
            onClick={() => setPerson('husband')}
            className={`h-11 flex-1 rounded-[10px] text-[13px] font-semibold transition-colors ${
              person === 'husband'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            夫
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={person === 'wife'}
            onClick={() => setPerson('wife')}
            className={`h-11 flex-1 rounded-[10px] text-[13px] font-semibold transition-colors ${
              person === 'wife'
                ? 'bg-accent text-accent-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            妻
          </button>
        </div>
      </div>

      {/* デバイス名 */}
      <div>
        <label
          htmlFor={`${formId}-device-name`}
          className="text-[11px] font-bold tracking-[0.14em] uppercase text-sub-text block mb-2"
        >
          デバイス名（任意）
        </label>
        <input
          id={`${formId}-device-name`}
          type="text"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="例：自分のスマートフォン"
          className="h-11 w-full rounded-[10px] border-none bg-muted px-3 text-[13px] outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
          <span className="text-[12px] font-semibold text-destructive">{error}</span>
        </div>
      )}

      <Button
        onClick={handleRegister}
        disabled={isRegistering}
        className="w-full h-11 rounded-[12px] bg-accent text-accent-foreground text-[13px] font-bold tracking-[0.10em]"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        {isRegistering ? '登録中…' : 'パスキーを登録'}
      </Button>
    </div>
  )
}
