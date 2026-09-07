'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
export function MigrationCode({ code }: { code: string }) {
  const [message, setMessage] = useState('')
  return <div className="min-w-0 space-y-3 rounded-xl bg-muted p-4">
    <p className="text-xs font-bold text-sub-text">照合コード</p>
    <code data-testid="migration-code" className="block break-all font-mono text-sm leading-relaxed select-all">{code}</code>
    <Button variant="outline" className="min-h-11" onClick={async () => {
      try { await navigator.clipboard.writeText(code); setMessage('コピーしました') }
      catch { setMessage('コードを選択してコピーしてください') }
    }}>コードをコピー</Button>
    <p role="status" className="text-xs text-sub-text">{message}</p>
  </div>
}
