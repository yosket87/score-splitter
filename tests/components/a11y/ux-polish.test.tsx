import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { DeleteButton } from '@/components/ui/delete-button'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { YearlyBarChart } from '@/components/charts/yearly-bar-chart'
import { TrendCard } from '@/components/charts/trend-card'
import { AddEntryFab } from '@/features/add-entry'
import { useIsMobile } from '@/hooks/use-is-mobile'
import type { MonthlySummary } from '@/types'

vi.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: vi.fn(),
}))

vi.mock('@/app/actions/income', () => ({
  createIncome: vi.fn(),
}))

vi.mock('@/app/actions/expense', () => ({
  createExpense: vi.fn(),
}))

vi.mock('@/app/actions/carryover', () => ({
  createCarryover: vi.fn(),
}))

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

beforeEach(() => {
  vi.mocked(useIsMobile).mockReturnValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UX polish', () => {
  it('Dialogの閉じるボタンが日本語のアクセシブルネームを持つ', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>設定内容を確認します。</DialogDescription>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument()
  })

  it('ResponsiveModalはデスクトップでRadix Dialogと説明を使う', () => {
    render(
      <ResponsiveModal
        open
        onOpenChange={() => {}}
        trigger={<button type="button">開く</button>}
        title="設定"
        description="設定内容を確認します。"
      >
        <div>内容</div>
      </ResponsiveModal>
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
    expect(dialog).toHaveClass('app-modal-surface')
    expect(dialog).toHaveAccessibleDescription('設定内容を確認します。')
  })

  it('ResponsiveModalはモバイルでVaul Drawerと説明を使う', () => {
    vi.mocked(useIsMobile).mockReturnValue(true)

    render(
      <ResponsiveModal
        open
        onOpenChange={() => {}}
        trigger={<button type="button">開く</button>}
        title="設定"
        description="設定内容を確認します。"
      >
        <div>内容</div>
      </ResponsiveModal>
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-slot', 'drawer-content')
    expect(dialog).toHaveClass('app-modal-surface')
    expect(dialog).toHaveAccessibleDescription('設定内容を確認します。')
  })

  it('削除確認は説明と44px操作を持ち、Escape後にフォーカスを戻す', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error')
    const consoleWarn = vi.spyOn(console, 'warn')

    render(
      <DeleteButton
        itemName="給料"
        onDelete={vi.fn().mockResolvedValue({ success: true })}
      />
    )

    const trigger = screen.getByRole('button', { name: '給料を削除' })
    await user.click(trigger)

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'この操作は取り消せません。削除してよろしいですか？'
    )
    expect(screen.getByRole('dialog')).toHaveClass('app-modal-surface')
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('size-11')
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: '削除する' })).toHaveClass('min-h-11')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect([...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join(' ')).not.toMatch(
      /Missing `Description`|aria-describedby/
    )
  })

  it('FABがsafe-area下部を加味する', () => {
    render(<AddEntryFab month="202604" />)

    expect(screen.getByRole('button', { name: '項目を追加' })).toHaveClass(
      'bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]'
    )
  })

  it('年次棒グラフに説明ラベルと凡例テキストがある', () => {
    const summaries: MonthlySummary[] = [
      { month: '202601', incomeTotal: 100000, expenseTotal: -80000, balance: 20000 },
      { month: '202602', incomeTotal: 100000, expenseTotal: -120000, balance: -20000 },
    ]

    render(<YearlyBarChart summaries={summaries} year={2026} />)

    expect(
      screen.getByRole('img', { name: '2026年の月次収支推移グラフ' })
    ).toBeInTheDocument()
    expect(screen.getByText('プラス')).toBeInTheDocument()
    expect(screen.getByText('マイナス')).toBeInTheDocument()
  })

  it('トレンドカードに説明ラベルがある', () => {
    const summaries: MonthlySummary[] = [
      { month: '202601', incomeTotal: 100000, expenseTotal: -80000, balance: 20000 },
      { month: '202602', incomeTotal: 120000, expenseTotal: -90000, balance: 30000 },
    ]

    render(<TrendCard summaries={summaries} currentMonth="202602" />)

    expect(
      screen.getByRole('img', { name: '直近2ヶ月の収入と支出の推移グラフ' })
    ).toBeInTheDocument()
  })

  it('トレンドカードは担当者色を流用せず収入・支出の意味色を使う', () => {
    const summaries: MonthlySummary[] = [
      { month: '202601', incomeTotal: 100000, expenseTotal: -80000, balance: 20000 },
      { month: '202602', incomeTotal: 120000, expenseTotal: -90000, balance: 30000 },
    ]

    render(<TrendCard summaries={summaries} currentMonth="202602" />)

    const chart = screen.getByRole('img', {
      name: '直近2ヶ月の収入と支出の推移グラフ',
    })
    expect(chart.getElementsByClassName('bg-income').length).toBeGreaterThan(0)
    expect(chart.getElementsByClassName('bg-expense').length).toBeGreaterThan(0)
    expect(chart.getElementsByClassName('bg-husband')).toHaveLength(0)
    expect(chart.getElementsByClassName('bg-wife')).toHaveLength(0)
    expect(chart.getElementsByClassName('bg-destructive')).toHaveLength(0)
  })
})
