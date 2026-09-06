import { startTransition, Suspense, useLayoutEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { generateAiDiagnosis, loadAiDiagnosis } from '@/app/actions/ai-diagnosis'
import { AiDiagnosisDialog } from '@/features/ai-diagnosis'
import { DiagnosisResult } from '@/features/ai-diagnosis/components/diagnosis-result'
import { useAiDiagnosis } from '@/features/ai-diagnosis/use-ai-diagnosis'
import type { AiDiagnosisView, DiagnosisViewItem } from '@/features/ai-diagnosis/domain'

vi.mock('@/app/actions/ai-diagnosis', () => ({
  loadAiDiagnosis: vi.fn(),
  generateAiDiagnosis: vi.fn(),
}))

const baseCandidate: Omit<DiagnosisViewItem, 'id' | 'kind' | 'commentary'> = {
  category: 'dining',
  currentAmount: 48000,
  baselineAmount: 32000,
  differenceAmount: 16000,
  differenceRate: 0.5,
  potentialAmount: 16000,
  contributingLabels: ['外食'],
  isLikelyOneOff: false,
}

const diagnosis: AiDiagnosisView = {
  month: '202604',
  summaryText: '外食の変化を一緒に振り返れる月でした。',
  currentExpenseTotal: 70500,
  baselineExpenseAverage: 54500,
  unresolvedCarryoverTotal: 10000,
  notableChanges: [
    {
      ...baseCandidate,
      id: 'increase:dining',
      kind: 'increase',
      commentary: '予定していた支出か確認してみましょう。',
    },
  ],
  positivePoints: [
    {
      ...baseCandidate,
      id: 'positive:groceries',
      kind: 'positive',
      category: 'groceries',
      currentAmount: 20000,
      baselineAmount: 30000,
      differenceAmount: -10000,
      differenceRate: -1 / 3,
      potentialAmount: null,
      contributingLabels: ['食料品'],
      commentary: '普段より落ち着いています。',
    },
  ],
  suggestions: [
    {
      ...baseCandidate,
      id: 'suggestion:dining',
      kind: 'suggestion',
      commentary: '回数を一度話し合うのも選択肢です。',
    },
  ],
  dataSufficiency: 'full',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadAiDiagnosis).mockResolvedValue({
    success: true,
    data: { diagnosis, stale: false },
  })
  vi.mocked(generateAiDiagnosis).mockResolvedValue({
    success: true,
    data: diagnosis,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('AiDiagnosisDialog', () => {
  it('保存済み診断を4ブロックと数値根拠で表示する', async () => {
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))

    expect(await screen.findByText('今月のまとめ')).toBeInTheDocument()
    expect(screen.getByText('気になった変化')).toBeInTheDocument()
    expect(screen.getByText('良かった点')).toBeInTheDocument()
    expect(screen.getByText('来月のヒント')).toBeInTheDocument()
    expect(screen.getAllByText('過去平均より16,000円増').length).toBeGreaterThan(0)
    expect(screen.getAllByText('今月 48,000円').length).toBeGreaterThan(0)
    expect(screen.getAllByText('増減率 50%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('削減余地 16,000円（目安）').length).toBeGreaterThan(0)
    expect(screen.getByText('支出総額 70,500円')).toBeInTheDocument()
    expect(screen.getByText('過去平均 54,500円')).toBeInTheDocument()
    expect(screen.getByText('確認事項')).toBeInTheDocument()
    expect(screen.getByText('未清算繰越 合計10,000円')).toBeInTheDocument()
  })

  it('期限切れ診断を残して最新データでの再診断を促す', async () => {
    vi.mocked(loadAiDiagnosis).mockResolvedValueOnce({
      success: true,
      data: { diagnosis, stale: true },
    })
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))

    expect(await screen.findByText(/家計データが更新されています/)).toBeInTheDocument()
    expect(screen.getByText(diagnosis.summaryText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最新データで再診断' })).toBeInTheDocument()
  })

  it('期限切れ診断の再実行に成功すると最新結果へ置き換える', async () => {
    const updatedDiagnosis = { ...diagnosis, summaryText: '最新データで振り返りました。' }
    vi.mocked(loadAiDiagnosis).mockResolvedValueOnce({
      success: true,
      data: { diagnosis, stale: true },
    })
    vi.mocked(generateAiDiagnosis).mockResolvedValueOnce({
      success: true,
      data: updatedDiagnosis,
    })
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    await user.click(await screen.findByRole('button', { name: '最新データで再診断' }))

    expect(await screen.findByText(updatedDiagnosis.summaryText)).toBeInTheDocument()
    expect(screen.queryByText(/家計データが更新されています/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'もう一度診断する' })).toBeInTheDocument()
  })

  it('source revision競合時は直前の診断をfreshのまま残さない', async () => {
    vi.mocked(generateAiDiagnosis).mockResolvedValueOnce({
      success: false,
      error: '家計データが更新されました。最新データで再診断してください',
      errorCode: 'source_revision_conflict',
    })
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    await user.click(await screen.findByRole('button', { name: 'もう一度診断する' }))

    expect(await screen.findByText(/家計データが更新されています/)).toBeInTheDocument()
    expect(screen.getByText(diagnosis.summaryText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最新データで再診断' })).toBeInTheDocument()
  })

  it('開くまで読み込まず、未保存なら説明と開始操作を表示する', async () => {
    vi.mocked(loadAiDiagnosis).mockResolvedValueOnce({
      success: true,
      data: { diagnosis: null, stale: false },
    })
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    expect(loadAiDiagnosis).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))

    expect(await screen.findByText('今月の家計を振り返ってみましょう')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '診断を始める' })).toBeInTheDocument()
    expect(generateAiDiagnosis).not.toHaveBeenCalled()
  })

  it('実行中は操作を無効にして3段階の状態をaria-liveで順番に通知する', async () => {
    const pendingLoad = deferred<Awaited<ReturnType<typeof loadAiDiagnosis>>>()
    vi.mocked(loadAiDiagnosis).mockReturnValueOnce(pendingLoad.promise)
    let resolveGeneration: ((value: Awaited<ReturnType<typeof generateAiDiagnosis>>) => void) | undefined
    vi.mocked(generateAiDiagnosis).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGeneration = resolve
      })
    )
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)
    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    expect(status).toHaveTextContent('保存済みの診断を読み込んでいます')
    const loadingRegion = document.querySelector('[aria-busy="true"]')
    expect(loadingRegion).toBeInTheDocument()
    expect(loadingRegion).not.toContainElement(status)

    await act(async () => {
      pendingLoad.resolve({
        success: true,
        data: { diagnosis: null, stale: false },
      })
    })
    await waitFor(() => expect(status).toBeEmptyDOMElement())
    const startButton = await screen.findByRole('button', { name: '診断を始める' })

    vi.useFakeTimers()
    fireEvent.click(startButton)

    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('支出を整理しています')
    expect(startButton).toBeDisabled()
    const busyRegion = document.querySelector('[aria-busy="true"]')
    expect(busyRegion).toBeInTheDocument()
    expect(busyRegion).not.toContainElement(status)

    act(() => vi.advanceTimersByTime(1000))
    expect(status).toHaveTextContent('過去の傾向と比較しています')
    act(() => vi.advanceTimersByTime(1000))
    expect(status).toHaveTextContent('振り返りを作成しています')

    await act(async () => {
      resolveGeneration?.({ success: true, data: diagnosis })
    })
    vi.useRealTimers()
    expect(await screen.findByText(diagnosis.summaryText)).toBeInTheDocument()
  })

  it('閉じても実行を継続し、再度開いても取得と実行を重複させない', async () => {
    vi.mocked(loadAiDiagnosis).mockResolvedValue({
      success: true,
      data: { diagnosis: null, stale: false },
    })
    const completedDiagnosis = { ...diagnosis, summaryText: '閉じている間に診断が完了しました。' }
    let resolveGeneration: ((value: Awaited<ReturnType<typeof generateAiDiagnosis>>) => void) | undefined
    vi.mocked(generateAiDiagnosis).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGeneration = resolve
      })
    )
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)
    const trigger = screen.getByRole('button', { name: 'AIで今月を振り返る' })

    await user.click(trigger)
    const startButton = await screen.findByRole('button', { name: '診断を始める' })
    fireEvent.click(startButton)
    fireEvent.click(startButton)
    expect(generateAiDiagnosis).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    expect(await screen.findByText('支出を整理しています')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '診断中…' })).toBeDisabled()
    expect(loadAiDiagnosis).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveGeneration?.({ success: true, data: completedDiagnosis })
    })
    expect(await screen.findByText(completedDiagnosis.summaryText)).toBeInTheDocument()
  })

  it('月変更を描画した時点で前月の診断を表示しない', async () => {
    const committedTexts: string[] = []
    const user = userEvent.setup()
    const Probe = ({ month }: { month: string }) => {
      useLayoutEffect(() => {
        committedTexts.push(document.body.textContent ?? '')
      }, [month])
      return null
    }
    const Harness = ({ month }: { month: string }) => (
      <>
        <AiDiagnosisDialog householdId="A" month={month} hasActualExpenses />
        <Probe month={month} />
      </>
    )
    const { rerender } = render(<Harness month="202604" />)
    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    expect(await screen.findByText(diagnosis.summaryText)).toBeInTheDocument()

    await act(async () => {
      rerender(<Harness month="202605" />)
    })

    expect(committedTexts.at(-1)).not.toContain(diagnosis.summaryText)
  })

  it('破棄される月変更renderがcommit済み月の読込完了を妨げない', async () => {
    const pendingLoad = deferred<Awaited<ReturnType<typeof loadAiDiagnosis>>>()
    const neverResolves = new Promise<never>(() => {})
    vi.mocked(loadAiDiagnosis).mockReturnValueOnce(pendingLoad.promise)

    function SuspendMay({ month }: { month: string }) {
      if (month === '202605') throw neverResolves
      return null
    }

    function ConcurrentHarness() {
      const [month, setMonth] = useState('202604')
      return (
        <>
          <button
            type="button"
            onClick={() => startTransition(() => setMonth('202605'))}
          >
            破棄される月変更
          </button>
          <Suspense fallback={<p>月を切り替えています</p>}>
            <AiDiagnosisDialog householdId="A" month={month} hasActualExpenses />
            <SuspendMay month={month} />
          </Suspense>
        </>
      )
    }

    const user = userEvent.setup()
    const { unmount } = render(<ConcurrentHarness />)
    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    expect(await screen.findByText('保存済みの診断を読み込んでいます')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: '破棄される月変更', hidden: true })
      )
    })
    expect(screen.queryByText('月を切り替えています')).not.toBeInTheDocument()
    await act(async () => {
      pendingLoad.resolve({ success: true, data: { diagnosis, stale: false } })
    })

    expect(await screen.findByText(diagnosis.summaryText)).toBeInTheDocument()
    expect(loadAiDiagnosis).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('新しい月の読込後に旧月の読込が完了しても表示を上書きしない', async () => {
    const oldLoad = deferred<Awaited<ReturnType<typeof loadAiDiagnosis>>>()
    const newLoad = deferred<Awaited<ReturnType<typeof loadAiDiagnosis>>>()
    const newDiagnosis = { ...diagnosis, month: '202605', summaryText: '5月の診断です。' }
    vi.mocked(loadAiDiagnosis).mockImplementation((month) =>
      month === '202604' ? oldLoad.promise : newLoad.promise
    )
    const user = userEvent.setup()
    const { rerender } = render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)
    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    await waitFor(() => expect(loadAiDiagnosis).toHaveBeenCalledWith('202604'))

    rerender(<AiDiagnosisDialog householdId="A" month="202605" hasActualExpenses />)
    await waitFor(() => expect(loadAiDiagnosis).toHaveBeenCalledWith('202605'))
    await act(async () => {
      newLoad.resolve({ success: true, data: { diagnosis: newDiagnosis, stale: false } })
    })
    expect(await screen.findByText(newDiagnosis.summaryText)).toBeInTheDocument()

    await act(async () => {
      oldLoad.resolve({ success: true, data: { diagnosis, stale: false } })
    })
    expect(screen.getByText(newDiagnosis.summaryText)).toBeInTheDocument()
    expect(screen.queryByText(diagnosis.summaryText)).not.toBeInTheDocument()
  })

  it('旧月の読込が新しい月の読込開始前に完了しても旧結果を再利用しない', async () => {
    const oldLoad = deferred<Awaited<ReturnType<typeof loadAiDiagnosis>>>()
    const newLoad = deferred<Awaited<ReturnType<typeof loadAiDiagnosis>>>()
    const newDiagnosis = { ...diagnosis, month: '202605', summaryText: '新しい月だけを表示します。' }
    vi.mocked(loadAiDiagnosis)
      .mockReturnValueOnce(oldLoad.promise)
      .mockReturnValueOnce(newLoad.promise)
    const user = userEvent.setup()
    const { rerender } = render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)
    const trigger = screen.getByRole('button', { name: 'AIで今月を振り返る' })
    await user.click(trigger)
    await waitFor(() => expect(loadAiDiagnosis).toHaveBeenCalledTimes(1))
    await user.keyboard('{Escape}')

    rerender(<AiDiagnosisDialog householdId="A" month="202605" hasActualExpenses />)
    await act(async () => {
      oldLoad.resolve({ success: true, data: { diagnosis, stale: false } })
    })
    expect(screen.queryByText(diagnosis.summaryText)).not.toBeInTheDocument()

    await user.click(trigger)
    await waitFor(() => expect(loadAiDiagnosis).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(diagnosis.summaryText)).not.toBeInTheDocument()
    await act(async () => {
      newLoad.resolve({ success: true, data: { diagnosis: newDiagnosis, stale: false } })
    })
    expect(await screen.findByText(newDiagnosis.summaryText)).toBeInTheDocument()
  })

  it('旧月の診断実行が月変更後に完了しても新しい月を上書きしない', async () => {
    const oldRun = deferred<Awaited<ReturnType<typeof generateAiDiagnosis>>>()
    const newDiagnosis = { ...diagnosis, month: '202605', summaryText: '5月の保存済み診断です。' }
    vi.mocked(loadAiDiagnosis)
      .mockResolvedValueOnce({ success: true, data: { diagnosis: null, stale: false } })
      .mockResolvedValueOnce({ success: true, data: { diagnosis: newDiagnosis, stale: false } })
    vi.mocked(generateAiDiagnosis).mockReturnValueOnce(oldRun.promise)
    const user = userEvent.setup()
    const { rerender } = render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)
    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    fireEvent.click(await screen.findByRole('button', { name: '診断を始める' }))

    rerender(<AiDiagnosisDialog householdId="A" month="202605" hasActualExpenses />)
    expect(await screen.findByText(newDiagnosis.summaryText)).toBeInTheDocument()
    await act(async () => {
      oldRun.resolve({ success: true, data: diagnosis })
    })

    expect(screen.getByText(newDiagnosis.summaryText)).toBeInTheDocument()
    expect(screen.queryByText(diagnosis.summaryText)).not.toBeInTheDocument()
  })

  it('診断実行中のunmountでタイマーと完了後更新を破棄する', async () => {
    const pendingRun = deferred<Awaited<ReturnType<typeof generateAiDiagnosis>>>()
    vi.mocked(loadAiDiagnosis).mockResolvedValueOnce({
      success: true,
      data: { diagnosis: null, stale: false },
    })
    vi.mocked(generateAiDiagnosis).mockReturnValueOnce(pendingRun.promise)
    const { result, unmount } = renderHook(() => useAiDiagnosis('202604', "A"))
    await act(async () => {
      await result.current.ensureLoaded()
    })
    vi.useFakeTimers()
    act(() => {
      void result.current.run()
    })
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => {
      pendingRun.resolve({ success: true, data: diagnosis })
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('実支出がない月は起点を無効にし、その理由を知覚可能にする', () => {
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses={false} />)

    const trigger = screen.getByRole('button', { name: 'AIで今月を振り返る' })
    const reason = screen.getByText('実支出がある月で利用できます')
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute('aria-describedby', reason.id)
    expect(trigger).toHaveClass('h-11', 'w-11')
    expect(loadAiDiagnosis).not.toHaveBeenCalled()
  })

  it('モバイルDrawerは本文だけを単一スクロール領域にしてoverscrollを閉じ込める', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList
    )
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    const drawer = document.querySelector('[data-slot="drawer-content"]')
    expect(drawer).toBeInTheDocument()
    const scrollOwners = drawer?.querySelectorAll('.overflow-y-auto') ?? []
    expect(scrollOwners).toHaveLength(1)
    expect(scrollOwners[0]).toHaveClass('overscroll-contain')

    matchMedia.mockRestore()
  })

  it('保存済み診断の取得失敗を安全に表示し、取得を再試行できる', async () => {
    vi.mocked(loadAiDiagnosis)
      .mockResolvedValueOnce({ success: false, error: 'AI診断に失敗しました' })
      .mockResolvedValueOnce({
        success: true,
        data: { diagnosis: null, stale: false },
      })
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('AI診断に失敗しました')
    await user.click(screen.getByRole('button', { name: 'もう一度読み込む' }))

    expect(await screen.findByRole('button', { name: '診断を始める' })).toBeInTheDocument()
    expect(loadAiDiagnosis).toHaveBeenCalledTimes(2)
    expect(generateAiDiagnosis).not.toHaveBeenCalled()
  })

  it('読み込みActionがrejectしても安全な文言で再試行可能にする', async () => {
    vi.mocked(loadAiDiagnosis).mockRejectedValueOnce(new Error('network details'))
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('AI診断に失敗しました')
    expect(screen.getByRole('button', { name: 'もう一度読み込む' })).toBeEnabled()
    expect(screen.queryByText('network details')).not.toBeInTheDocument()
  })

  it('409と一般エラーを安全に表示し、再試行の成功結果へ遷移する', async () => {
    vi.mocked(loadAiDiagnosis).mockResolvedValueOnce({
      success: true,
      data: { diagnosis: null, stale: false },
    })
    vi.mocked(generateAiDiagnosis)
      .mockResolvedValueOnce({ success: false, error: '診断を実行中です' })
      .mockResolvedValueOnce({ success: false, error: 'AI診断に失敗しました' })
      .mockResolvedValueOnce({ success: true, data: diagnosis })
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    await user.click(await screen.findByRole('button', { name: '診断を始める' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('診断を実行中です')

    await user.click(screen.getByRole('button', { name: '診断を始める' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('AI診断に失敗しました')

    await user.click(screen.getByRole('button', { name: '診断を始める' }))
    expect(await screen.findByText(diagnosis.summaryText)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(generateAiDiagnosis).toHaveBeenCalledTimes(3)
  })

  it('生成Actionがrejectしても安全な文言を表示して再試行可能に戻る', async () => {
    vi.mocked(loadAiDiagnosis).mockResolvedValueOnce({
      success: true,
      data: { diagnosis: null, stale: false },
    })
    vi.mocked(generateAiDiagnosis).mockRejectedValueOnce(new Error('network details'))
    const user = userEvent.setup()
    render(<AiDiagnosisDialog householdId="A" month="202604" hasActualExpenses />)

    await user.click(screen.getByRole('button', { name: 'AIで今月を振り返る' }))
    await user.click(await screen.findByRole('button', { name: '診断を始める' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('AI診断に失敗しました')
    expect(screen.getByRole('button', { name: '診断を始める' })).toBeEnabled()
    expect(screen.queryByText('network details')).not.toBeInTheDocument()
  })
})

describe('DiagnosisResult', () => {
  it('当月0円の良かった点を過去ラベルで表示し変化なしと誤表示しない', () => {
    const zeroPositive = {
      ...diagnosis.notableChanges[0],
      id: 'positive:groceries',
      kind: 'positive' as const,
      category: 'groceries' as const,
      currentAmount: 0,
      baselineAmount: 10000,
      differenceAmount: -10000,
      differenceRate: -1,
      contributingLabels: ['食料品'],
    }
    render(
      <DiagnosisResult
        diagnosis={{
          ...diagnosis,
          notableChanges: [],
          positivePoints: [zeroPositive],
          suggestions: [],
        }}
        stale={false}
      />
    )

    expect(screen.getByText('良かった点')).toBeInTheDocument()
    expect(screen.getByText('食料品')).toBeInTheDocument()
    expect(screen.getByText('今月 0円')).toBeInTheDocument()
    expect(screen.queryByText('groceries')).not.toBeInTheDocument()
    expect(screen.queryByText('今月は大きな変化はありません')).not.toBeInTheDocument()
  })

  it('候補がないセクションを隠して大きな変化がないことを表示する', () => {
    const emptyDiagnosis: AiDiagnosisView = {
      ...diagnosis,
      notableChanges: [],
      positivePoints: [],
      suggestions: [],
      unresolvedCarryoverTotal: 0,
    }
    render(<DiagnosisResult diagnosis={emptyDiagnosis} stale={false} />)

    expect(screen.getByText('今月は大きな変化はありません')).toBeInTheDocument()
    expect(screen.queryByText('気になった変化')).not.toBeInTheDocument()
    expect(screen.queryByText('良かった点')).not.toBeInTheDocument()
    expect(screen.queryByText('来月のヒント')).not.toBeInTheDocument()
    expect(screen.queryByText('確認事項')).not.toBeInTheDocument()
  })

  it('比較データが0〜2か月なら参考値であることを明記する', () => {
    render(
      <DiagnosisResult
        diagnosis={{ ...diagnosis, dataSufficiency: 'reference' }}
        stale={false}
      />
    )

    expect(screen.getByText(/結果は参考値です/)).toBeInTheDocument()
  })

  it('AI文章をHTMLとして解釈せず、内部カテゴリやpersonを表示しない', () => {
    const unsafeText = '<img src=x onerror=alert(1)>'
    const { container } = render(
      <DiagnosisResult
        diagnosis={{
          ...diagnosis,
          summaryText: unsafeText,
          notableChanges: [],
          positivePoints: [],
          suggestions: [],
        }}
        stale={false}
      />
    )

    expect(screen.getByText(unsafeText)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container).not.toHaveTextContent('dining')
    expect(container).not.toHaveTextContent('groceries')
    expect(container).not.toHaveTextContent('husband')
    expect(container).not.toHaveTextContent('wife')
  })

  it('255文字のラベルと400文字のAI文章を横スクロールなしで折り返す', () => {
    const longLabel = 'ラ'.repeat(255)
    const longSummary = '要'.repeat(400)
    const longCommentary = '説'.repeat(400)
    const { container } = render(
      <DiagnosisResult
        diagnosis={{
          ...diagnosis,
          summaryText: longSummary,
          notableChanges: [
            {
              ...diagnosis.notableChanges[0],
              contributingLabels: [longLabel],
              commentary: longCommentary,
            },
          ],
          positivePoints: [],
          suggestions: [],
        }}
        stale={false}
      />
    )

    expect(container.firstElementChild).not.toHaveClass('overflow-x-hidden')
    for (const text of [longLabel, longSummary, longCommentary]) {
      expect(screen.getByText(text)).toHaveClass('min-w-0', '[overflow-wrap:anywhere]')
    }
  })
})

it('同月の世帯切替で保存診断と遅いA応答を破棄する', async () => {
  const response = deferred<Awaited<ReturnType<typeof loadAiDiagnosis>>>()
  vi.mocked(loadAiDiagnosis).mockReturnValueOnce(response.promise)
  const view = renderHook(({ householdId }) => useAiDiagnosis('202604', householdId), { initialProps: { householdId: 'A' } })
  act(() => { void view.result.current.ensureLoaded() })
  view.rerender({ householdId: 'B' })
  expect(view.result.current.state.status).toBe('idle')
  await act(async () => response.resolve({ success: true, data: { diagnosis, stale: false } }))
  expect(view.result.current.state.status).toBe('idle')
  await act(async () => { await view.result.current.ensureLoaded() })
  expect(view.result.current.state.status).toBe('saved')
})
