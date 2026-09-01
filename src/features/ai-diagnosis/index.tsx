'use client'

import { useEffect, useId, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { DiagnosisDialogContent, DiagnosisProgress } from './components/diagnosis-dialog-content'
import { useAiDiagnosis } from './use-ai-diagnosis'

interface AiDiagnosisDialogProps {
  month: string
  hasActualExpenses: boolean
}

export function AiDiagnosisDialog({ month, hasActualExpenses }: AiDiagnosisDialogProps) {
  const unavailableReasonId = useId()
  const [open, setOpen] = useState(false)
  const { state, ensureLoaded, retryLoad, run } = useAiDiagnosis(month)

  useEffect(() => {
    if (open) void ensureLoaded()
  }, [ensureLoaded, month, open])

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
        <DiagnosisProgress state={state} />
        <div
          className="min-h-0 overflow-y-auto"
          aria-busy={state.status === 'loading' || state.status === 'running'}
        >
          <DiagnosisDialogContent state={state} onRetryLoad={retryLoad} onRun={run} />
        </div>
      </ResponsiveModal>
      {!hasActualExpenses && (
        <p id={unavailableReasonId} className="max-w-40 text-right text-xs leading-4 text-muted-foreground">
          実支出がある月で利用できます
        </p>
      )}
    </div>
  )
}

export type { AiDiagnosisDialogProps }
