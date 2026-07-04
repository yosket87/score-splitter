import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ExpenseSection } from '@/features/expense'
import { deleteExpense } from '@/app/actions/expense'
import type { Expense } from '@/types'

// Server Actionsのモック
vi.mock('@/app/actions/expense', () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  toggleExpenseCarryover: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('ExpenseSection', () => {
  const mockExpenses: Expense[] = [
    {
      id: '1',
      month: '202601',
      label: '食費',
      amount: -50000, // 支出は負の値
      person: 'wife',
      isCarryover: false,
    },
    {
      id: '2',
      month: '202601',
      label: '家賃',
      amount: -100000,
      person: 'husband',
      isCarryover: false,
    },
  ]

  it('支出一覧を表示する', () => {
    render(<ExpenseSection expenses={mockExpenses} month="202601" />)

    expect(screen.getByText('食費')).toBeInTheDocument()
    expect(screen.getByText('家賃')).toBeInTheDocument()
  })

  it('合計金額を表示する（負の値）', () => {
    render(<ExpenseSection expenses={mockExpenses} month="202601" />)

    // 合計は−150,000円（U+2212 数学マイナス記号）
    expect(screen.getByText('−¥150,000')).toBeInTheDocument()
  })

  it('各項目の金額を表示する', () => {
    render(<ExpenseSection expenses={mockExpenses} month="202601" />)

    // 金額は −¥NNN,NNN 形式（U+2212 数学マイナス記号）
    expect(screen.getByText('−¥50,000')).toBeInTheDocument()
    expect(screen.getByText('−¥100,000')).toBeInTheDocument()
  })

  it('支出がない場合メッセージを表示する', () => {
    render(<ExpenseSection expenses={[]} month="202601" />)

    expect(screen.getByText('支出がありません')).toBeInTheDocument()
  })

  it('タイトル「支出」を表示する', () => {
    render(<ExpenseSection expenses={mockExpenses} month="202601" />)

    // タイトルは "Expense / 支出" 形式
    expect(screen.getByText('Expense / 支出')).toBeInTheDocument()
  })

  it('担当者バッジを表示する', () => {
    render(<ExpenseSection expenses={mockExpenses} month="202601" />)

    // バッジとSelectオプションの両方に「夫」「妻」が存在するのでgetAllByTextを使用
    const husbandElements = screen.getAllByText('夫')
    const wifeElements = screen.getAllByText('妻')
    expect(husbandElements.length).toBeGreaterThanOrEqual(1)
    expect(wifeElements.length).toBeGreaterThanOrEqual(1)
  })

  it('繰越フラグ付き支出に「繰越」バッジを表示する', () => {
    const expensesWithCarryover: Expense[] = [
      {
        id: '1',
        month: '202601',
        label: '食費',
        amount: -50000,
        person: 'wife',
        isCarryover: true,
      },
      {
        id: '2',
        month: '202601',
        label: '家賃',
        amount: -100000,
        person: 'husband',
        isCarryover: false,
      },
    ]

    render(<ExpenseSection expenses={expensesWithCarryover} month="202601" />)

    // 繰越バッジが表示される
    expect(screen.getByText('繰越')).toBeInTheDocument()
  })

  it('繰越でない支出は通常のスタイルで表示する', () => {
    render(<ExpenseSection expenses={mockExpenses} month="202601" />)

    // 繰越バッジが表示されない
    expect(screen.queryByText('繰越')).not.toBeInTheDocument()

    // 金額が支出色で表示される（U+2212 数学マイナス記号）
    const amountElement = screen.getByText('−¥50,000')
    expect(amountElement).toHaveClass('text-[#E2483D]')
  })

  it('ヘッダーに繰越件数を表示する', () => {
    const mixedExpenses: Expense[] = [
      {
        id: '1',
        month: '202601',
        label: '食費',
        amount: -50000,
        person: 'wife',
        isCarryover: false,
      },
      {
        id: '2',
        month: '202601',
        label: '前月繰越分',
        amount: -30000,
        person: 'husband',
        isCarryover: true,
      },
    ]

    render(<ExpenseSection expenses={mixedExpenses} month="202601" />)

    // 実績合計（isCarryover: falseの合計）: −50,000（行アイテムに表示）
    const amounts = screen.getAllByText('−¥50,000')
    expect(amounts.length).toBeGreaterThanOrEqual(1)

    // ヘッダーに繰越件数が表示される（「2件 — 繰越 1件」）
    expect(screen.getByText(/繰越\s+1件/)).toBeInTheDocument()
  })

  it('削除前に確認し、失敗時はエラーtoastを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteExpense).mockResolvedValueOnce({
      success: false,
      error: '支出の削除に失敗しました',
    })

    render(<ExpenseSection expenses={mockExpenses} month="202601" />)

    await user.click(screen.getByRole('button', { name: '食費を削除' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('「食費」を削除しますか？')).toBeInTheDocument()
    expect(deleteExpense).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '削除する' }))

    expect(deleteExpense).toHaveBeenCalledWith('1')
    expect(toast.error).toHaveBeenCalledWith('支出の削除に失敗しました')
  })
})
