import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { CopyMonthDialog } from '@/features/copy-month'
import { copyMonthData, getCopyMonthPreview } from '@/app/actions/copy-month'

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}))

vi.mock('@/app/actions/copy-month', () => ({
  copyMonthData: vi.fn(),
  getCopyMonthPreview: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: navigationMocks.refresh,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  globalThis.IntersectionObserver = class {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: number[] = []

    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as typeof IntersectionObserver
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CopyMonthDialog', () => {
  it('説明を関連付け、44px操作とEscape後のフォーカス復帰を維持する', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error')
    const consoleWarn = vi.spyOn(console, 'warn')
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 0,
        carryoverCount: 0,
        items: [],
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    const trigger = screen.getByRole('button', { name: '前月からコピー' })
    await user.click(trigger)

    expect(await screen.findByRole('dialog')).toHaveAccessibleDescription(
      'コピー元と対象を確認し、コピーする項目を選択します。'
    )
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('size-11')
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: 'コピーする (0件)' })).toHaveClass('min-h-11')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect([...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join(' ')).not.toMatch(
      /Missing `Description`|aria-describedby/
    )
  })

  it('ダイアログを開くと全項目がデフォルト選択済みで件数が表示される', async () => {
    const user = userEvent.setup()
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 0,
        carryoverCount: 1,
        items: [
          {
            id: 'income-1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
          },
          {
            id: 'expense-1',
            label: '食費',
            amount: -50000,
            person: 'wife',
            type: 'expense',
          },
        ],
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    await user.click(screen.getByRole('button', { name: '前月からコピー' }))

    expect(await screen.findByText('収入')).toBeInTheDocument()
    expect(screen.getByText('支出')).toBeInTheDocument()
    expect(screen.getByLabelText('給料を選択')).toBeChecked()
    expect(screen.getByLabelText('食費を選択')).toBeChecked()
    expect(screen.getByLabelText(/繰越/)).toBeChecked()
    expect(screen.getByRole('button', { name: 'コピーする (3件)' })).toBeEnabled()
  })

  it('すべて解除でコピー不可になり、すべて選択で復帰する', async () => {
    const user = userEvent.setup()
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 0,
        carryoverCount: 1,
        items: [
          {
            id: 'income-1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
          },
          {
            id: 'expense-1',
            label: '食費',
            amount: -50000,
            person: 'wife',
            type: 'expense',
          },
        ],
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    await user.click(screen.getByRole('button', { name: '前月からコピー' }))
    await screen.findByText('コピー対象を選択')

    await user.click(screen.getByRole('button', { name: 'すべて解除' }))
    expect(screen.getByRole('button', { name: 'コピーする (0件)' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'すべて選択' }))
    expect(screen.getByRole('button', { name: 'コピーする (3件)' })).toBeEnabled()
  })

  it('項目名のみを選ぶと該当項目だけlabelOnlyでコピーする', async () => {
    const user = userEvent.setup()
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 0,
        carryoverCount: 0,
        items: [
          {
            id: 'income-1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
          },
          {
            id: 'expense-1',
            label: '食費',
            amount: -50000,
            person: 'wife',
            type: 'expense',
          },
        ],
      },
    })
    vi.mocked(copyMonthData).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        copied: { incomes: 1, expenses: 1, carryovers: 0 },
        skipped: { incomes: 0, expenses: 0, carryovers: 0 },
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    await user.click(screen.getByRole('button', { name: '前月からコピー' }))
    await screen.findByText('コピー対象を選択')

    await user.selectOptions(
      screen.getByLabelText('給料のコピーモード'),
      'labelOnly'
    )
    await user.click(screen.getByRole('button', { name: 'コピーする (2件)' }))

    await waitFor(() => {
      expect(copyMonthData).toHaveBeenCalledWith({
        sourceMonth: '202603',
        targetMonth: '202604',
        mode: 'add',
        includeCarryover: true,
        selectedItems: [
          {
            id: 'income-1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
            itemCopyMode: 'labelOnly',
          },
          {
            id: 'expense-1',
            label: '食費',
            amount: -50000,
            person: 'wife',
            type: 'expense',
            itemCopyMode: 'withAmount',
          },
        ],
      })
    })
  })

  it('空データでは空メッセージを表示しコピーできない', async () => {
    const user = userEvent.setup()
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 0,
        carryoverCount: 0,
        items: [],
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    await user.click(screen.getByRole('button', { name: '前月からコピー' }))

    expect(await screen.findByText('コピー元の月にデータがありません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'コピーする (0件)' })).toBeDisabled()
  })

  it('addモードで成功するとtoastを表示して更新しダイアログを閉じる', async () => {
    const user = userEvent.setup()
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 0,
        carryoverCount: 1,
        items: [
          {
            id: 'income-1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
          },
        ],
      },
    })
    vi.mocked(copyMonthData).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        copied: { incomes: 1, expenses: 0, carryovers: 1 },
        skipped: { incomes: 0, expenses: 0, carryovers: 0 },
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    await user.click(screen.getByRole('button', { name: '前月からコピー' }))
    await screen.findByText('コピー対象を選択')

    await user.click(screen.getByRole('button', { name: 'コピーする (2件)' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('2件のデータをコピーしました')
    })
    expect(navigationMocks.refresh).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByText('前月からデータをコピー')).not.toBeInTheDocument()
    })
  })

  it('置換モードでは既存データ削除の確認後にコピーする', async () => {
    const user = userEvent.setup()
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 2,
        carryoverCount: 0,
        items: [
          {
            id: 'income-1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
          },
        ],
      },
    })
    vi.mocked(copyMonthData).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        copied: { incomes: 1, expenses: 0, carryovers: 0 },
        skipped: { incomes: 0, expenses: 0, carryovers: 0 },
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    await user.click(screen.getByRole('button', { name: '前月からコピー' }))
    await screen.findByText('既存データの処理')

    await user.click(screen.getAllByRole('combobox')[1])
    await user.click(
      await screen.findByRole('option', {
        name: '置換（既存データを削除してコピー）',
      })
    )
    await user.click(screen.getByRole('button', { name: 'コピーする (1件)' }))

    expect(copyMonthData).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '既存の2件を削除してコピーします'
    )

    await user.click(screen.getByRole('button', { name: '既存データを削除してコピー' }))

    await waitFor(() => {
      expect(copyMonthData).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'replace',
          sourceMonth: '202603',
          targetMonth: '202604',
        })
      )
    })
    expect(navigationMocks.refresh).toHaveBeenCalled()
  })
})
