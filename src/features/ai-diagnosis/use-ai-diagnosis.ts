'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { generateAiDiagnosis, loadAiDiagnosis } from '@/app/actions/ai-diagnosis'
import type { DiagnosisSnapshot } from './domain'

const PROGRESS_STAGE_COUNT = 3
const PROGRESS_STAGE_INTERVAL_MS = 1000
const SAFE_ERROR_MESSAGE = 'AI診断に失敗しました'

type AiDiagnosisState =
  | { status: 'idle'; month: string }
  | { status: 'loading'; month: string }
  | { status: 'loadError'; month: string; error: string }
  | { status: 'empty'; month: string; error: string | null }
  | {
      status: 'saved'
      month: string
      snapshot: DiagnosisSnapshot
      error: string | null
    }
  | {
      status: 'running'
      month: string
      snapshot: DiagnosisSnapshot | null
      progressStage: number
    }

type SetDiagnosisState = Dispatch<SetStateAction<AiDiagnosisState>>

interface RequestLifecycle {
  currentMonthRef: MutableRefObject<string>
  loadedMonthRef: MutableRefObject<string | null>
  loadIdRef: MutableRefObject<number>
  runIdRef: MutableRefObject<number>
  runInFlightRef: MutableRefObject<boolean>
  progressTimerRef: MutableRefObject<number | null>
  canCommitLoad: (month: string, id: number) => boolean
  canCommitRun: (month: string, id: number) => boolean
}

function clearTimer(timer: MutableRefObject<number | null>) {
  if (timer.current === null) return
  window.clearInterval(timer.current)
  timer.current = null
}

function useLifecycleEffects(
  month: string,
  currentMonthRef: MutableRefObject<string>,
  mountedRef: MutableRefObject<boolean>,
  invalidate: () => void,
  setState: SetDiagnosisState
) {
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      invalidate()
    }
  }, [invalidate, mountedRef])
  useLayoutEffect(() => {
    currentMonthRef.current = month
    invalidate()
    setState({ status: 'idle', month })
    return invalidate
  }, [currentMonthRef, invalidate, month, setState])
}

function useRequestLifecycle(
  month: string,
  setState: SetDiagnosisState
): RequestLifecycle {
  const currentMonthRef = useRef(month)
  const mountedRef = useRef(false)
  const loadedMonth = useRef<string | null>(null)
  const loadId = useRef(0)
  const runId = useRef(0)
  const runInFlight = useRef(false)
  const progressTimer = useRef<number | null>(null)

  const invalidate = useCallback(() => {
    loadId.current += 1
    runId.current += 1
    loadedMonth.current = null
    runInFlight.current = false
    clearTimer(progressTimer)
  }, [])
  useLifecycleEffects(
    month,
    currentMonthRef,
    mountedRef,
    invalidate,
    setState
  )

  const canCommitLoad = useCallback(
    (requestMonth: string, id: number) =>
      mountedRef.current &&
      currentMonthRef.current === requestMonth &&
      loadId.current === id,
    []
  )
  const canCommitRun = useCallback(
    (requestMonth: string, id: number) =>
      mountedRef.current &&
      currentMonthRef.current === requestMonth &&
      runId.current === id,
    []
  )
  return {
    currentMonthRef,
    loadedMonthRef: loadedMonth,
    loadIdRef: loadId,
    runIdRef: runId,
    runInFlightRef: runInFlight,
    progressTimerRef: progressTimer,
    canCommitLoad,
    canCommitRun,
  }
}

function useLoadDiagnosis(lifecycle: RequestLifecycle, setState: SetDiagnosisState) {
  const { canCommitLoad, currentMonthRef, loadedMonthRef, loadIdRef } = lifecycle
  return useCallback(async (force = false) => {
    const requestMonth = currentMonthRef.current
    if (!force && loadedMonthRef.current === requestMonth) return
    const requestId = loadIdRef.current + 1
    loadIdRef.current = requestId
    loadedMonthRef.current = requestMonth
    setState({ status: 'loading', month: requestMonth })
    try {
      const result = await loadAiDiagnosis(requestMonth)
      if (!canCommitLoad(requestMonth, requestId)) return
      if (result.success && result.data) {
        setState(
          result.data.diagnosis
            ? {
                status: 'saved',
                month: requestMonth,
                snapshot: result.data,
                error: null,
              }
            : { status: 'empty', month: requestMonth, error: null }
        )
        return
      }
      loadedMonthRef.current = null
      setState({
        status: 'loadError',
        month: requestMonth,
        error: result.error ?? SAFE_ERROR_MESSAGE,
      })
    } catch {
      if (!canCommitLoad(requestMonth, requestId)) return
      loadedMonthRef.current = null
      setState({ status: 'loadError', month: requestMonth, error: SAFE_ERROR_MESSAGE })
    }
  }, [canCommitLoad, currentMonthRef, loadIdRef, loadedMonthRef, setState])
}

function readyState(
  month: string,
  snapshot: DiagnosisSnapshot | null,
  error: string
): AiDiagnosisState {
  return snapshot
    ? { status: 'saved', month, snapshot, error }
    : { status: 'empty', month, error }
}

function snapshotOf(state: AiDiagnosisState): DiagnosisSnapshot | null {
  return state.status === 'saved' || state.status === 'running' ? state.snapshot : null
}

interface RunExecution {
  requestMonth: string
  requestId: number
  previousSnapshot: DiagnosisSnapshot | null
  lifecycle: RequestLifecycle
  setState: SetDiagnosisState
}

function startProgressTimer({
  requestMonth,
  requestId,
  lifecycle,
  setState,
}: RunExecution): number {
  return window.setInterval(() => {
    if (!lifecycle.canCommitRun(requestMonth, requestId)) return
    setState((current) =>
      current.status === 'running' && current.month === requestMonth
        ? {
            ...current,
            progressStage: Math.min(
              current.progressStage + 1,
              PROGRESS_STAGE_COUNT - 1
            ),
          }
        : current
    )
  }, PROGRESS_STAGE_INTERVAL_MS)
}

async function executeDiagnosisRun(execution: RunExecution, timer: number) {
  const { requestMonth, requestId, previousSnapshot, lifecycle, setState } =
    execution
  try {
    const result = await generateAiDiagnosis(requestMonth)
    if (!lifecycle.canCommitRun(requestMonth, requestId)) return
    setState(
      result.success && result.data
        ? {
            status: 'saved',
            month: requestMonth,
            snapshot: { diagnosis: result.data, stale: false },
            error: null,
          }
        : readyState(
            requestMonth,
            previousSnapshot,
            result.error ?? SAFE_ERROR_MESSAGE
          )
    )
  } catch {
    if (lifecycle.canCommitRun(requestMonth, requestId)) {
      setState(readyState(requestMonth, previousSnapshot, SAFE_ERROR_MESSAGE))
    }
  } finally {
    window.clearInterval(timer)
    if (lifecycle.progressTimerRef.current === timer) {
      lifecycle.progressTimerRef.current = null
    }
    if (lifecycle.canCommitRun(requestMonth, requestId)) {
      lifecycle.runInFlightRef.current = false
    }
  }
}

function useRunDiagnosis(
  lifecycle: RequestLifecycle,
  state: AiDiagnosisState,
  setState: SetDiagnosisState
) {
  const { currentMonthRef, progressTimerRef, runIdRef, runInFlightRef } = lifecycle
  return useCallback(async () => {
    if (runInFlightRef.current) return
    const requestMonth = currentMonthRef.current
    const requestId = runIdRef.current + 1
    const previousSnapshot = snapshotOf(state)
    runIdRef.current = requestId
    runInFlightRef.current = true
    setState({
      status: 'running',
      month: requestMonth,
      snapshot: previousSnapshot,
      progressStage: 0,
    })
    const execution = {
      requestMonth,
      requestId,
      previousSnapshot,
      lifecycle,
      setState,
    }
    const timer = startProgressTimer(execution)
    progressTimerRef.current = timer
    await executeDiagnosisRun(execution, timer)
  }, [
    currentMonthRef,
    lifecycle,
    progressTimerRef,
    runIdRef,
    runInFlightRef,
    setState,
    state,
  ])
}

export function useAiDiagnosis(month: string) {
  const [state, setState] = useState<AiDiagnosisState>({ status: 'idle', month })
  const lifecycle = useRequestLifecycle(month, setState)
  const load = useLoadDiagnosis(lifecycle, setState)
  const run = useRunDiagnosis(lifecycle, state, setState)
  const visibleState: AiDiagnosisState =
    state.month === month ? state : { status: 'idle', month }
  return { state: visibleState, ensureLoaded: load, retryLoad: () => load(true), run }
}

export type { AiDiagnosisState }
