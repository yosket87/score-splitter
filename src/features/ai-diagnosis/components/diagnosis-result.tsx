import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Lightbulb, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type {
  AiDiagnosisView,
  DiagnosisViewItem,
} from '@/features/ai-diagnosis/domain'

interface DiagnosisResultProps {
  diagnosis: AiDiagnosisView
  stale: boolean
}

function formatYen(amount: number): string {
  return `${formatCurrency(Math.abs(amount)).replace('¥', '')}円`
}

function getDifferenceLabel(item: DiagnosisViewItem): string {
  if (item.differenceAmount === 0) return '過去平均と同水準'
  return `過去平均より${formatYen(item.differenceAmount)}${item.differenceAmount > 0 ? '増' : '減'}`
}

function Evidence({ item }: { item: DiagnosisViewItem }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>今月 {formatYen(item.currentAmount)}</span>
      {item.baselineAmount !== null && <span>{getDifferenceLabel(item)}</span>}
      {item.differenceRate !== null && (
        <span>増減率 {Math.round(Math.abs(item.differenceRate) * 100)}%</span>
      )}
      {item.potentialAmount !== null && item.potentialAmount > 0 && (
        <span>削減余地 {formatYen(item.potentialAmount)}（目安）</span>
      )}
    </div>
  )
}

function ResultSection({
  title,
  icon,
  items,
}: {
  title: string
  icon: ReactNode
  items: DiagnosisViewItem[]
}) {
  if (items.length === 0) return null

  return (
    <section
      className="min-w-0 rounded-2xl border bg-card p-4"
      aria-labelledby={`diagnosis-${title}`}
    >
      <h3
        id={`diagnosis-${title}`}
        className="flex items-center gap-2 text-base font-semibold"
      >
        {icon}
        {title}
      </h3>
      <ul className="mt-3 space-y-4">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            {item.contributingLabels.length > 0 && (
              <p className="min-w-0 font-medium [overflow-wrap:anywhere]">
                {item.contributingLabels.join('・')}
              </p>
            )}
            <p className="mt-1 min-w-0 text-base leading-7 text-foreground/90 [overflow-wrap:anywhere]">
              {item.commentary}
            </p>
            <Evidence item={item} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DiagnosisResult({ diagnosis, stale }: DiagnosisResultProps) {
  const hasCandidates =
    diagnosis.notableChanges.length > 0 ||
    diagnosis.positivePoints.length > 0 ||
    diagnosis.suggestions.length > 0

  return (
    <div className="min-w-0 space-y-3">
      {stale && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          家計データが更新されています。最新の内容で再診断してください。
        </div>
      )}

      {diagnosis.dataSufficiency !== 'full' && (
        <p className="rounded-xl border bg-muted/50 p-3 text-sm">
          比較できる過去データが0〜2か月のため、結果は参考値です。
        </p>
      )}

      <section
        className="min-w-0 rounded-2xl border bg-card p-4"
        aria-labelledby="diagnosis-summary"
      >
        <h3 id="diagnosis-summary" className="text-base font-semibold">
          今月のまとめ
        </h3>
        <p className="mt-2 min-w-0 text-base leading-7 text-foreground/90 [overflow-wrap:anywhere]">
          {diagnosis.summaryText}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>支出総額 {formatYen(diagnosis.currentExpenseTotal)}</span>
          {diagnosis.baselineExpenseAverage !== null && (
            <span>過去平均 {formatYen(diagnosis.baselineExpenseAverage)}</span>
          )}
        </div>
      </section>

      {!hasCandidates && (
        <p className="rounded-2xl border bg-card p-4 text-base">
          今月は大きな変化はありません
        </p>
      )}

      <ResultSection
        title="気になった変化"
        icon={<TrendingUp className="size-4" aria-hidden="true" />}
        items={diagnosis.notableChanges}
      />
      <ResultSection
        title="良かった点"
        icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
        items={diagnosis.positivePoints}
      />
      <ResultSection
        title="来月のヒント"
        icon={<Lightbulb className="size-4" aria-hidden="true" />}
        items={diagnosis.suggestions}
      />

      {diagnosis.unresolvedCarryoverTotal > 0 && (
        <section
          className="rounded-2xl border bg-muted/40 p-4"
          aria-labelledby="diagnosis-carryover"
        >
          <h3
            id="diagnosis-carryover"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <AlertCircle className="size-4" aria-hidden="true" />
            確認事項
          </h3>
          <p className="mt-2 text-base">
            未清算繰越 合計{formatYen(diagnosis.unresolvedCarryoverTotal)}
          </p>
        </section>
      )}
    </div>
  )
}

export type { DiagnosisResultProps }
