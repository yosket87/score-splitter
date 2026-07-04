'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { listPasskeys } from '@/app/actions/passkeys'
import { PasskeyList } from './components/passkey-list'
import { RegisterPasskeyForm } from './components/register-passkey-form'
import type { PasskeyInfo } from './types'

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([])
  const [loadError, setLoadError] = useState(false)
  const [isPending, startTransition] = useTransition()

  const fetchPasskeys = useCallback(() => {
    startTransition(async () => {
      const result = await listPasskeys()
      if (result.success && result.data) {
        setPasskeys(result.data)
        setLoadError(false)
      } else {
        setLoadError(true)
      }
    })
  }, [])

  useEffect(() => {
    fetchPasskeys()
  }, [fetchPasskeys])

  return (
    <div className="space-y-6">
      {/* 登録済みパスキー一覧 */}
      <section>
        <h2 className="text-[11px] font-bold tracking-[0.14em] uppercase text-sub-text mb-3">
          登録済みパスキー
        </h2>
        {loadError ? (
          <div
            role="alert"
            className="rounded-[12px] bg-destructive/10 px-4 py-3 text-[13px] text-destructive"
          >
            <p className="font-semibold">パスキー一覧の取得に失敗しました</p>
            <p className="mt-1 text-[12px]">時間をおいて再度お試しください。</p>
          </div>
        ) : isPending ? (
          <div className="text-center py-6 text-[13px] text-sub-text">
            読み込み中…
          </div>
        ) : (
          <PasskeyList passkeys={passkeys} onDeleted={fetchPasskeys} />
        )}
      </section>

      {/* 登録フォーム */}
      <section className="border-t border-border pt-6">
        <h2 className="text-[11px] font-bold tracking-[0.14em] uppercase text-sub-text mb-3">
          新しいパスキーを登録
        </h2>
        <RegisterPasskeyForm onRegistered={fetchPasskeys} />
      </section>
    </div>
  )
}
