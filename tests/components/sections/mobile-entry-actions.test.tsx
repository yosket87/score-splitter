import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ExpenseSection } from '@/features/expense'
import { IncomeSection } from '@/features/income'
import { CarryoverSection } from '@/features/carryover'
import { deleteExpense, toggleExpenseCarryover, updateExpense } from '@/app/actions/expense'
import type { Expense } from '@/types'

vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: () => true }))
vi.mock('@/app/actions/expense', () => ({
  createExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(), toggleExpenseCarryover: vi.fn(),
}))
vi.mock('@/app/actions/income', () => ({
  createIncome: vi.fn(), updateIncome: vi.fn(), deleteIncome: vi.fn(),
}))
vi.mock('@/app/actions/carryover', () => ({
  createCarryover: vi.fn(), updateCarryover: vi.fn(), deleteCarryover: vi.fn(), toggleCarryoverCleared: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const expense: Expense = {
  id: '1', month: '202602', label: '食費', amount: -50000, person: 'wife', isCarryover: false,
}

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  // jsdomにはCSSが読み込まれないため、Drawerの移動量と終了状態を明示する。
  const style = document.createElement('style')
  style.textContent = '[data-vaul-drawer] { transform: none; animation-name: none; }'
  document.head.append(style)
})

beforeEach(() => vi.clearAllMocks())

describe('スマホの項目メニュー', () => {
  it('編集画面はメニューが閉じた後も表示され、更新できる', async () => {
    const user = userEvent.setup()
    vi.mocked(updateExpense).mockResolvedValue({ success: true })
    render(<ExpenseSection expenses={[expense]} month="202602" />)

    expect(screen.queryByRole('button', { name: '食費を編集' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '食費のメニュー' }))
    await user.click(screen.getByRole('menuitem', { name: '編集' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '支出を編集' })).toBeVisible()
    expect(screen.getByRole('dialog', { name: '支出を編集' })).toHaveFocus()
    const label = screen.getByDisplayValue('食費')
    await user.clear(label)
    await user.type(label, '食費と日用品')
    await user.click(screen.getByRole('button', { name: '更新' }))
    await waitFor(() => expect(updateExpense).toHaveBeenCalled())
    expect(vi.mocked(updateExpense).mock.calls[0][1].get('label')).toBe('食費と日用品')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('削除は確認してから実行し、キャンセルするとメニューボタンへ戻る', async () => {
    const user = userEvent.setup()
    render(<ExpenseSection expenses={[expense]} month="202602" />)
    const trigger = screen.getByRole('button', { name: '食費のメニュー' })
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: '削除' }))

    expect(screen.getByRole('dialog')).toBeVisible()
    expect(deleteExpense).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(deleteExpense).not.toHaveBeenCalled()
  })

  it('繰越の送信中は連打できず、成功するとメニューを閉じる', async () => {
    const user = userEvent.setup()
    let resolveAction!: (value: { success: true }) => void
    vi.mocked(toggleExpenseCarryover).mockReturnValueOnce(new Promise((resolve) => { resolveAction = resolve }))
    render(<ExpenseSection expenses={[expense]} month="202602" />)
    await user.click(screen.getByRole('button', { name: '食費のメニュー' }))
    const toggle = screen.getByRole('menuitem', { name: '繰越にする' })
    await user.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-disabled', 'true'))
    await user.click(toggle)
    expect(toggleExpenseCarryover).toHaveBeenCalledTimes(1)
    expect(toggleExpenseCarryover).toHaveBeenCalledWith('1', true, '202602')
    resolveAction({ success: true })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it.each([
    () => Promise.resolve({ success: false as const, error: '更新に失敗しました' }),
    () => Promise.reject(new Error('通信エラー')),
  ])('繰越に失敗した場合はエラーを表示して再操作できる', async (action) => {
    const user = userEvent.setup()
    vi.mocked(toggleExpenseCarryover).mockImplementationOnce(action)
    render(<ExpenseSection expenses={[expense]} month="202602" />)
    await user.click(screen.getByRole('button', { name: '食費のメニュー' }))
    await user.click(screen.getByRole('menuitem', { name: '繰越にする' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByRole('menuitem', { name: '繰越にする' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('収入と清算済みの繰越でも適切な操作を表示する', async () => {
    const user = userEvent.setup()
    render(<>
      <IncomeSection incomes={[{ ...expense, label: '給料', amount: 50000 }]} month="202602" />
      <CarryoverSection carryovers={[{ ...expense, label: '前月繰越', isCleared: true }]} month="202602" />
    </>)
    await user.click(screen.getByRole('button', { name: '給料のメニュー' }))
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '前月繰越のメニュー' }))
    expect(screen.getByRole('menuitem', { name: '清算を取消' })).toBeVisible()
  })
})
