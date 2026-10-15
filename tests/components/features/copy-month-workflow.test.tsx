import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { CopyMonthDialog } from '@/features/copy-month'
import { copyMonthData, getCopyMonthPreview } from '@/app/actions/copy-month'
import type { CopyMonthPreview } from '@/types'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/app/actions/copy-month', () => ({
  copyMonthData: vi.fn(), getCopyMonthPreview: vi.fn(),
}))

const preview: CopyMonthPreview = {
  sourceMonth: '202603', targetMonth: '202604', existingCount: 2,
  carryoverFingerprint: 'dummy-fingerprint', carryoverCount: 1,
  items: [
    { id: 'income-1', label: '給与', amount: 300000, person: 'husband', type: 'income' },
    { id: 'expense-1', label: '食費', amount: -50000, person: 'wife', type: 'expense' },
  ],
}
const success = {
  success: true as const,
  data: {
    success: true,
    copied: { incomes: 1, expenses: 0, carryovers: 0 },
    skipped: { incomes: 0, expenses: 1, carryovers: 0 },
  },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function renderDialog() {
  return render(<CopyMonthDialog householdId="dummy-household" currentMonth="202604" previousMonth="202603" />)
}

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCopyMonthPreview).mockResolvedValue({ success: true, data: preview })
})

describe('月コピーのワークフロー', () => {
  it.each([
    { result: { success: false, error: '再取得してください' }, message: '再取得してください' },
    { result: { success: false }, message: 'プレビューの取得に失敗しました' },
  ])('preview失敗後は閉じて再取得できる: $message', async ({ result, message }) => {
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce(result)
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    expect(toast.error).toHaveBeenCalledWith(message)
    expect(screen.getByRole('button', { name: 'コピーする (0件)' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    expect(await screen.findByLabelText('給与を選択')).toBeChecked()
    expect(screen.getByRole('button', { name: 'コピーする (3件)' })).toBeEnabled()
  })

  it('previewの例外を表示し、書き込みと再取得は実行しない', async () => {
    vi.mocked(getCopyMonthPreview).mockRejectedValueOnce(new Error('dummy failure'))
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    expect(toast.error).toHaveBeenCalledWith('プレビューの取得に失敗しました')
    expect(screen.getByRole('button', { name: 'コピーする (0件)' })).toBeDisabled()
    expect(copyMonthData).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('閉じる前の遅いpreviewが再表示後の選択肢を上書きしない', async () => {
    const old = deferred<Awaited<ReturnType<typeof getCopyMonthPreview>>>()
    vi.mocked(getCopyMonthPreview).mockReturnValueOnce(old.promise)
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    expect(await screen.findByLabelText('給与を選択')).toBeChecked()
    await act(async () => old.resolve({
      success: true,
      data: { ...preview, items: [{ ...preview.items[0], id: 'old', label: '古い項目' }] },
    }))
    expect(screen.queryByLabelText('古い項目を選択')).not.toBeInTheDocument()
    expect(screen.getByLabelText('給与を選択')).toBeChecked()
  })

  it('コピー失敗時は項目名のみ・除外指定を保持して再試行し、成功件数とskip件数を通知する', async () => {
    vi.mocked(copyMonthData).mockResolvedValueOnce({ success: false, error: '再試行してください' }).mockResolvedValueOnce(success)
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    await screen.findByLabelText('給与を選択')
    await userEvent.selectOptions(screen.getByLabelText('給与のコピーモード'), 'labelOnly')
    await userEvent.click(screen.getByLabelText('食費を選択'))
    await userEvent.click(screen.getByLabelText(/繰越/))
    await userEvent.click(screen.getByRole('button', { name: 'コピーする (1件)' }))
    expect(toast.error).toHaveBeenCalledWith('再試行してください')
    expect(screen.getByLabelText('給与のコピーモード')).toHaveValue('labelOnly')
    expect(screen.getByLabelText('食費を選択')).not.toBeChecked()
    expect(screen.getByLabelText(/繰越/)).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'コピーする (1件)' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'コピーする (1件)' }))
    expect(copyMonthData).toHaveBeenLastCalledWith({
      sourceMonth: '202603', targetMonth: '202604', mode: 'add', includeCarryover: false,
      carryoverFingerprint: 'dummy-fingerprint',
      selectedItems: [{ id: 'income-1', label: '給与', amount: 300000, person: 'husband', type: 'income', itemCopyMode: 'labelOnly' }],
    })
    expect(toast.success).toHaveBeenCalledWith('1件コピー、1件スキップしました')
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['result', 'exception'])('コピー失敗でもpendingを解除する: %s', async (failure) => {
    if (failure === 'result') vi.mocked(copyMonthData).mockResolvedValueOnce({ success: false })
    else vi.mocked(copyMonthData).mockRejectedValueOnce(new Error('dummy failure'))
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    await userEvent.click(await screen.findByRole('button', { name: 'コピーする (3件)' }))
    expect(toast.error).toHaveBeenCalledWith('コピーに失敗しました')
    expect(screen.getByRole('button', { name: 'コピーする (3件)' })).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('繰越だけのpreviewでも選択とfingerprintをコピーへ渡す', async () => {
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({ success: true, data: { ...preview, items: [], existingCount: 0 } })
    vi.mocked(copyMonthData).mockResolvedValueOnce({
      success: true,
      data: { success: true, copied: { incomes: 0, expenses: 0, carryovers: 1 }, skipped: { incomes: 0, expenses: 0, carryovers: 0 } },
    })
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    await userEvent.click(await screen.findByRole('button', { name: 'コピーする (1件)' }))
    expect(copyMonthData).toHaveBeenCalledWith({
      sourceMonth: '202603', targetMonth: '202604', mode: 'add', includeCarryover: true,
      carryoverFingerprint: 'dummy-fingerprint', selectedItems: [],
    })
    expect(toast.success).toHaveBeenCalledWith('1件のデータをコピーしました')
  })

  it('月の変更後に返った古いコピー結果で新しい画面を更新しない', async () => {
    const response = deferred<Awaited<ReturnType<typeof copyMonthData>>>()
    vi.mocked(copyMonthData).mockReturnValueOnce(response.promise)
    const view = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    await userEvent.click(await screen.findByRole('button', { name: 'コピーする (3件)' }))
    expect(screen.getByRole('button', { name: 'コピー中…' })).toBeDisabled()
    view.rerender(<CopyMonthDialog householdId="dummy-household" currentMonth="202605" previousMonth="202604" />)
    await userEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
    await screen.findByLabelText('給与を選択')
    await act(async () => response.resolve(success))
    expect(screen.getByRole('button', { name: 'コピーする (3件)' })).toBeEnabled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
