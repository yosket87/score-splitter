'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { generateAiDiagnosis, loadAiDiagnosis } from '@/app/actions/ai-diagnosis'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { DiagnosisResult } from './components/diagnosis-result'
import type { DiagnosisSnapshot } from './domain'

interface AiDiagnosisDialogProps {
  month: string
  hasActualExpenses: boolean
}

const PROGRESS_STAGES = [
  '支出を整理しています',
  '過去の傾向と比較しています',
  '振り返りを作成しています',
] as const
const PROGRESS_STAGE_INTERVAL_MS = 1000

export function AiDiagnosisDialog({
  month,
  hasActualExpenses,
}: AiDiagnosisDialogProps) {
  const unavailableReasonId = useId()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [progressStage, setProgressStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [snapshot, setSnapshot] = useState<DiagnosisSnapshot | null>(null)
  const runInFlight = useRef(false)
  const loadedMonth = useRef<string | null>(null)
  const loadRequestId = useRef(0)
  const runRequestId = useRef(0)
  const progressTimer = useRef<number | null>(null)

  useEffect(() => {
    loadRequestId.current += 1
    runRequestId.current += 1
    loadedMonth.current = null
    runInFlight.current = false
    if (progressTimer.current !== null) {
      window.clearInterval(progressTimer.current)
      progressTimer.current = null
    }
    setSnapshot(null)
    setError(null)
    setLoadFailed(false)
    setLoading(false)
    setRunning(false)

    return () => {
      if (progressTimer.current !== null) {
        window.clearInterval(progressTimer.current)
        progressTimer.current = null
      }
    }
  }, [month])

  const fetchDiagnosis = useCallback(async () => {
    const requestId = loadRequestId.current + 1
    loadRequestId.current = requestId
    loadedMonth.current = month
    setLoading(true)
    setError(null)
    setLoadFailed(false)
    try {
      const result = await loadAiDiagnosis(month)
      if (loadRequestId.current !== requestId) return

      if (result.success && result.data) {
        setSnapshot(result.data)
      } else {
        loadedMonth.current = null
        setError(result.error ?? 'AI診断に失敗しました')
        setLoadFailed(true)
      }
    } catch {
      if (loadRequestId.current !== requestId) return
      loadedMonth.current = null
      setError('AI診断に失敗しました')
      setLoadFailed(true)
    } finally {
      if (loadRequestId.current === requestId) setLoading(false)
    }
  }, [month])

  useEffect(() => {
    if (!open || loadedMonth.current === month) return
    void fetchDiagnosis()
  }, [fetchDiagnosis, month, open])

  async function runDiagnosis() {
    if (runInFlight.current) return

    const requestId = runRequestId.current + 1
    runRequestId.current = requestId
    runInFlight.current = true
    setRunning(true)
    setProgressStage(0)
    setError(null)
    const timer = window.setInterval(() => {
      setProgressStage((current) =>
        Math.min(current + 1, PROGRESS_STAGES.length - 1)
      )
    }, PROGRESS_STAGE_INTERVAL_MS)
    progressTimer.current = timer
    try {
      const result = await generateAiDiagnosis(month)
      if (runRequestId.current !== requestId) return
      if (result.success && result.data) {
        setSnapshot({ diagnosis: result.data, stale: false })
      } else {
        setError(result.error ?? 'AI診断に失敗しました')
      }
    } catch {
      if (runRequestId.current === requestId) {
        setError('AI診断に失敗しました')
      }
    } finally {
      window.clearInterval(timer)
      if (progressTimer.current === timer) {
        progressTimer.current = null
      }
      if (runRequestId.current === requestId) {
        runInFlight.current = false
        setRunning(false)
      }
    }
  }

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!hasActualExpenses}
      aria-label="AIで今月を振り返る"
      aria-describedby={!hasActualExpenses ? unavailableReasonId : undefined}
      className="h-11 w-11 gap-1 p-0 motion-reduce:transition-none motion-reduce:active:scale-100 sm:w-auto sm:px-3"
    >
      <Sparkles className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">AIで今月を振り返る</span>
    </Button>
  )

  return (
    <div className="flex flex-col items-end gap-1">
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        title="AIで今月を振り返る"
        description="家計の変化を、過去の自分たちと比べて振り返ります。"
        dialogContentClassName="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden"
        drawerContentClassName="max-h-[90vh] overflow-hidden"
        drawerBodyClassName="min-h-0 overflow-y-auto"
      >
        <div className="min-h-0 overflow-y-auto" aria-busy={loading || running}>
          {running && (
            <div
              role="status"
              aria-live="polite"
              className="mb-4 flex min-h-11 items-center gap-2 rounded-xl border bg-muted/50 p-3 text-sm"
            >
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              {PROGRESS_STAGES[progressStage]}
            </div>
          )}
          {loading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex min-h-32 items-center justify-center gap-2 text-muted-foreground"
            >
              <LoaderCircle
                className="size-5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              保存済みの診断を読み込んでいます
            </div>
          ) : loadFailed ? (
            <div className="space-y-4 py-3">
              <p
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
              >
                {error}
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={fetchDiagnosis}
                >
                  もう一度読み込む
                </Button>
              </div>
            </div>
          ) : snapshot?.diagnosis ? (
            <div className="space-y-4">
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
                >
                  {error}
                </p>
              )}
              <DiagnosisResult
                diagnosis={snapshot.diagnosis}
                stale={snapshot.stale}
              />
              <div className="flex justify-end border-t pt-4">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={running}
                  onClick={runDiagnosis}
                >
                  {running
                    ? '診断中…'
                    : snapshot.stale
                      ? '最新データで再診断'
                      : 'もう一度診断する'}
                </Button>
              </div>
            </div>
          ) : snapshot ? (
            <div className="space-y-4 py-3">
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
                >
                  {error}
                </p>
              )}
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
                  onClick={runDiagnosis}
                >
                  {running ? '診断中…' : '診断を始める'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </ResponsiveModal>
      {!hasActualExpenses && (
        <p
          id={unavailableReasonId}
          className="max-w-40 text-right text-xs leading-4 text-muted-foreground"
        >
          実支出がある月で利用できます
        </p>
      )}
    </div>
  )
}

export type { AiDiagnosisDialogProps }
