'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { correctPayment, getPaymentOperation, getPaymentStatus, recordPayment } from '@/app/actions/payment-status'
import type { CorrectPaymentInput, PaymentActionResult, PaymentRecord, PaymentStatus, RecordPaymentInput } from '@/types/payment-status'
import { PaymentHistory } from './payment-history'

export function paymentLabel(amount: number) {
  if (amount === 0) return '0円'
  return `${amount < 0 ? '妻 → 夫' : '夫 → 妻'} ${Math.abs(amount).toLocaleString('ja-JP')}円`
}
function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}
type Pending = { kind: 'record'; input: RecordPaymentInput } | { kind: 'correct'; input: CorrectPaymentInput }

export function PaymentStatusPanel({ month, initialResult }: { month: string; initialResult: PaymentActionResult<PaymentStatus> }) {
  const router = useRouter()
  const [loaded, setLoaded] = useState<{ source: typeof initialResult; value: typeof initialResult } | null>(null)
  const result = loaded?.source === initialResult ? loaded.value : initialResult
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const primaryButton = useRef<HTMLButtonElement>(null)
  const historyButton = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<PaymentStatus | null>(null)
  const [history, setHistory] = useState(false)
  const [editing, setEditing] = useState<PaymentRecord | null>(null)
  const [voidOnly, setVoidOnly] = useState(false)
  const [paidOn, setPaidOn] = useState(today)
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState('1')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const storageKey = `payment-operation:${month}`
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (stored) {
        const operation = JSON.parse(stored) as Pending
        if (operation.input?.month === month && ['record', 'correct'].includes(operation.kind)) setPending(operation)
      }
    } catch { setError('保存中の操作を読み込めませんでした。振込記録を確認してください。') }
  }, [storageKey, month])

  async function refresh() {
    const next = await getPaymentStatus(month)
    setLoaded({ source: initialResult, value: next })
    return next
  }
  async function run(task: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try { await task() } catch { setError('通信を確認できませんでした。記録の結果を確認してから再送してください。') }
    finally { running.current = false; setBusy(false) }
  }
  function clearPending() {
    sessionStorage.removeItem(storageKey)
    setPending(null)
  }
  async function complete() {
    clearPending()
    setQuote(null)
    setEditing(null)
    await refresh()
    router.refresh()
  }
  async function submit(operation: Pending) {
    // 応答が失われても、操作番号だけでなく確定時の全入力をそのまま再送する。
    sessionStorage.setItem(storageKey, JSON.stringify(operation))
    setPending(operation)
    const response = operation.kind === 'record' ? await recordPayment(operation.input) : await correctPayment(operation.input)
    if (response.success) await complete()
    else {
      setError(response.error)
      if (response.code >= 400 && response.code < 500) {
        clearPending()
        setQuote(null)
        setEditing(null)
        await refresh()
      }
    }
  }
  async function confirm(record?: PaymentRecord, cancel = false) {
    await run(async () => {
      const latest = await refresh()
      if (!latest.success) { setError(latest.error); return }
      if (record) {
        const current = latest.data.payments.find((payment) => payment.id === record.id && !payment.voidedAt)
        if (!current) { setError('この記録はすでに取り消されています。'); return }
        setEditing(current)
        setVoidOnly(cancel)
        setAmount(String(Math.abs(current.signedYen)))
        setDirection(current.signedYen < 0 ? '-1' : '1')
        setPaidOn(current.paidOn)
        setReason('')
        setHistory(false)
      } else {
        if (!latest.data.remainingSignedYen) { setError('振込が必要な差額はありません。'); return }
        setVoidOnly(false)
        setPaidOn(today())
      }
      setQuote(latest.data)
    })
  }
  const status = result.success ? result.data : null
  const active = status?.payments.filter((payment) => !payment.voidedAt) ?? []
  const lastDate = active.map((payment) => payment.paidOn).sort().at(-1)
  return (
    <section aria-label="振込状況" className="my-4 space-y-3">
      {status ? <div className={`rounded-2xl border p-4 ${status.state === 'paid' || status.state === 'difference' ? 'border-emerald-600/20 bg-emerald-500/10' : 'border-border bg-muted/30'}`}>
        <div className="flex flex-wrap items-center gap-2">
          {active.length || status.state === 'paid' || status.state === 'difference' ? <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />}
          <span className="text-sm font-semibold">{status.state === 'unnecessary' ? '振込不要' : status.state === 'unpaid' ? '振込前' : '振込済み'}</span>
          {status.state === 'difference' && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">差額あり</span>}
          {lastDate && <span className="text-xs text-muted-foreground">{lastDate} 振込</span>}
        </div>
        {(status.state === 'paid' || status.state === 'difference') && <p className="mt-2 text-sm">振込済み額：{paymentLabel(status.netPaidSignedYen)}</p>}
        {status.state === 'difference' && <p className="mt-2 text-sm font-semibold">残りの振込額：{paymentLabel(status.remainingSignedYen)}</p>}
        {status.state === 'unnecessary' && <p className="mt-2 text-xs text-muted-foreground">この月の振込は必要ありません。</p>}
        {status.remainingSignedYen !== 0 && <Button ref={primaryButton} className="mt-3 w-full rounded-xl bg-accent text-accent-foreground hover:bg-accent/90" disabled={busy || !!pending} onClick={() => confirm()}>{status.state === 'difference' ? '差額を振込済みにする' : '振込済みにする'}</Button>}
        {status.payments.length > 0 && <Button ref={historyButton} variant="ghost" className="mt-2 h-auto min-h-9 px-0 text-sm" onClick={() => setHistory(true)}>記録を見る</Button>}
      </div> : <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{result.success ? '' : result.error}<Button variant="outline" className="mt-2 block" disabled={busy} onClick={() => run(async () => { await refresh() })}>再取得</Button></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pending && <div className="space-y-2 rounded-xl border p-3 text-sm"><p>記録の結果が未確認です。新しい記録を作る前に確認してください。</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => run(async () => {
        const response = await getPaymentOperation(month, pending.input.operationId)
        if (response.success && response.data) await complete()
        else setError(response.success ? '記録はまだ確認できません。同じ内容で再送できます。' : response.error)
      })}>結果を確認</Button><Button disabled={busy} onClick={() => run(() => submit(pending))}>同じ内容で再送</Button></div></div>}
      <Dialog open={!!quote && !pending} onOpenChange={(open) => { if (!open && !busy) { setQuote(null); setEditing(null) } }}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); (historyButton.current ?? primaryButton.current)?.focus() }} className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? voidOnly ? '振込記録を取り消す' : '振込記録を訂正する' : '振込内容の確認'}</DialogTitle><DialogDescription>実際の振込・返金は行いません。銀行で行った振込の記録です。</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault()
            if (!quote) return
            const base = { month, operationId: crypto.randomUUID(), expectedRevision: quote.revision }
            void run(() => submit(editing ? { kind: 'correct', input: { ...base, paymentId: editing.id, reason, replacement: voidOnly ? null : { signedYen: Number(amount) * Number(direction), paidOn } } } : { kind: 'record', input: { ...base, confirmedSignedYen: quote.remainingSignedYen, paidOn } }))
          }}>
            {!editing && <><p className="text-xl font-bold">{paymentLabel(quote?.remainingSignedYen ?? 0)}</p><p className="text-xs text-muted-foreground">1円未満は切り捨てて記録します。</p></>}
            {editing && !voidOnly && <><label className="block text-sm">振込方向<select aria-label="振込方向" className="mt-1 block w-full rounded-md border bg-background p-2" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="1">夫 → 妻</option><option value="-1">妻 → 夫</option></select></label><label className="block text-sm">実際の振込額（円）<Input type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label></>}
            {!voidOnly && <label className="block text-sm">支払日<Input type="date" required max={today()} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} /></label>}
            {editing && <label className="block text-sm">{voidOnly ? '取消' : '訂正'}理由<Input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
            <Button className="w-full" type="submit" disabled={busy || (!!editing && !reason.trim())}>{busy ? '記録中…' : editing ? voidOnly ? '記録を取り消す' : '訂正を記録する' : '振込済みとして記録'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {status && <PaymentHistory onCloseAutoFocus={() => historyButton.current?.focus()} open={history} onOpenChange={setHistory} payments={status.payments} disabled={busy || !!pending} onCorrect={(payment, cancel) => confirm(payment, cancel)} />}
    </section>
  )
}
