import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PaymentRecord } from '@/types/payment-status'

function amountLabel(amount: number) {
  return `${amount < 0 ? '妻 → 夫' : '夫 → 妻'} ${Math.abs(amount).toLocaleString('ja-JP')}円`
}

export function PaymentHistory({ open, onOpenChange, payments, disabled, onCorrect, onCloseAutoFocus }: {
  onCloseAutoFocus: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  payments: PaymentRecord[]
  disabled: boolean
  onCorrect: (payment: PaymentRecord, cancel: boolean) => void
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); onCloseAutoFocus() }} className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>振込記録</DialogTitle><DialogDescription>当時の明細と振込内容を確認できます。訂正しても履歴は残ります。</DialogDescription></DialogHeader>
      <ul className="space-y-4">
        {payments.map((payment) => <li key={payment.id} className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-semibold">{amountLabel(payment.signedYen)} {payment.voidedAt && <span className="text-muted-foreground">（取消済み）</span>}</p>
          <p className="text-xs text-muted-foreground">支払日 {payment.paidOn} · {payment.actor.person === 'husband' ? '夫による記録' : payment.actor.person === 'wife' ? '妻による記録' : '共有ログインによる記録'}</p>
          {payment.voidReason && <p className="text-sm">取消理由：{payment.voidReason}</p>}
          <details className="text-sm">
            <summary className="cursor-pointer py-2 font-medium">記録時の内訳を見る</summary>
            <div className="space-y-3 py-2">
              <p>当時の精算額：{amountLabel(payment.snapshot.calculation.settlement)}</p>
              <p className="text-xs text-muted-foreground">当時のデータです。現在の明細を編集しても変わりません。</p>
              {(['incomes', 'expenses', 'carryovers'] as const).map((kind) => <div key={kind}><p className="font-semibold">{kind === 'incomes' ? '収入' : kind === 'expenses' ? '支出' : '繰越'}</p><ul className="space-y-1">{payment.snapshot[kind].map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2"><span>{entry.person === 'husband' ? '夫' : '妻'} · {entry.label}{'isCarryover' in entry && entry.isCarryover ? '（繰越扱い）' : ''}{'isCleared' in entry ? entry.isCleared ? '（清算対象）' : '（対象外）' : ''}</span><span>{Math.abs(entry.amount).toLocaleString('ja-JP')}円</span></li>)}{!payment.snapshot[kind].length && <li className="text-muted-foreground">記録なし</li>}</ul></div>)}
            </div>
          </details>
          {!payment.voidedAt && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={disabled} onClick={() => onCorrect(payment, false)}>記録を訂正</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => onCorrect(payment, true)}>振込済みの記録を取り消す</Button></div>}
        </li>)}
      </ul>
    </DialogContent>
  </Dialog>
}
