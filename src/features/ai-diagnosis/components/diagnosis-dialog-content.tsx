import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DiagnosisResult } from './diagnosis-result'
import type { AiDiagnosisState } from '../use-ai-diagnosis'

const PROGRESS_STAGES = [
  '支出を整理しています',
  '過去の傾向と比較しています',
  '振り返りを作成しています',
] as const

function ErrorMessage({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      {children}
    </p>
  )
}

export function DiagnosisStatus({ state }: { state: AiDiagnosisState }) {
  const message =
    state.status === 'loading'
      ? '保存済みの診断を読み込んでいます'
      : state.status === 'running'
        ? PROGRESS_STAGES[state.progressStage]
        : ''
  const busy = state.status === 'loading' || state.status === 'running'
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={
        busy
          ? 'mb-4 flex min-h-11 items-center gap-2 rounded-xl border bg-muted/50 p-3 text-sm'
          : 'sr-only'
      }
    >
      {busy && (
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {message}
    </div>
  )
}

function LoadingState() {
  return <div className="min-h-24" aria-hidden="true" />
}

function LoadErrorState({
  error,
  onRetry,
}: {
  error: string
  onRetry: () => void
}) {
  return (
    <div className="space-y-4 py-3">
      <ErrorMessage>{error}</ErrorMessage>
      <div className="flex justify-end">
        <Button type="button" className="min-h-11" onClick={onRetry}>
          もう一度読み込む
        </Button>
      </div>
    </div>
  )
}

function EmptyDiagnosisState({
  error,
  running,
  onRun,
}: {
  error: string | null
  running: boolean
  onRun: () => void
}) {
  return (
    <div className="space-y-4 py-3">
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-base font-semibold">
          今月の家計を振り返ってみましょう
        </h3>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          支出の変化と良かった点を、過去の家計データをもとに整理します。診断が家計データを変更することはありません。
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          className="min-h-11"
          disabled={running}
          onClick={onRun}
        >
          {running ? '診断中…' : '診断を始める'}
        </Button>
      </div>
    </div>
  )
}

type SavedState =
  | Extract<AiDiagnosisState, { status: 'saved' }>
  | Extract<AiDiagnosisState, { status: 'running' }>

function SavedDiagnosisState({
  state,
  running,
  onRun,
}: {
  state: SavedState
  running: boolean
  onRun: () => void
}) {
  const snapshot = state.snapshot
  if (!snapshot?.diagnosis) return null
  const error = state.status === 'saved' ? state.error : null
  return (
    <div className="space-y-4">
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <DiagnosisResult diagnosis={snapshot.diagnosis} stale={snapshot.stale} />
      <div className="flex justify-end border-t pt-4">
        <Button
          type="button"
          className="min-h-11"
          disabled={running}
          onClick={onRun}
        >
          {running
            ? '診断中…'
            : snapshot.stale
              ? '最新データで再診断'
              : 'もう一度診断する'}
        </Button>
      </div>
    </div>
  )
}

export function DiagnosisDialogContent({
  state,
  onRetryLoad,
  onRun,
}: {
  state: AiDiagnosisState
  onRetryLoad: () => void
  onRun: () => void
}) {
  if (state.status === 'idle') return null
  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'loadError') {
    return <LoadErrorState error={state.error} onRetry={onRetryLoad} />
  }
  if (state.status === 'saved') {
    return <SavedDiagnosisState state={state} running={false} onRun={onRun} />
  }
  if (state.status === 'running' && state.snapshot?.diagnosis) {
    return <SavedDiagnosisState state={state} running onRun={onRun} />
  }
  return (
    <EmptyDiagnosisState
      error={state.status === 'empty' ? state.error : null}
      running={state.status === 'running'}
      onRun={onRun}
    />
  )
}
