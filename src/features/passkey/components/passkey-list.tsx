'use client'

import { Key } from 'lucide-react'
import { DeleteButton } from '@/components/ui/delete-button'
import { deletePasskey } from '@/app/actions/passkeys'
import { PERSON_LABELS } from '@/lib/constants'
import type { PasskeyInfo } from '../types'

interface PasskeyListProps {
  passkeys: PasskeyInfo[]
  onDeleted: () => void
}

export function PasskeyList({ passkeys, onDeleted }: PasskeyListProps) {
  if (passkeys.length === 0) {
    return (
      <div className="text-center py-8 text-sub-text">
        <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-[13px]">パスキーが登録されていません</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {passkeys.map((passkey) => (
        <div
          key={passkey.id}
          className="flex items-center justify-between rounded-[12px] bg-muted/50 px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <Key className="h-4 w-4 text-sub-text" />
            <div>
              <p className="text-[13px] font-semibold">
                {passkey.deviceName ?? 'パスキー'}
              </p>
              <p className="text-[11px] text-sub-text">
                {PERSON_LABELS[passkey.person]} ・{' '}
                {new Date(passkey.createdAt).toLocaleDateString('ja-JP')}
              </p>
            </div>
          </div>
          <DeleteButton
            itemName={passkey.deviceName ?? 'パスキー'}
            label={`${passkey.deviceName ?? 'パスキー'}を削除`}
            confirmDescription="このパスキーでのログインができなくなります。削除してよろしいですか？"
            onDelete={() => deletePasskey(passkey.id)}
            onDeleted={onDeleted}
          />
        </div>
      ))}
    </div>
  )
}
