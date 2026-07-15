import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { IncomeSection } from '@/features/income'
import { deleteIncome } from '@/app/actions/income'
import type { Income } from '@/types'

// Server Actionsのモック
vi.mock('@/app/actions/income', () => ({
  createIncome: vi.fn(),
  updateIncome: vi.fn(),
  deleteIncome: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('IncomeSection', () => {
  const mockIncomes: Income[] = [
    {
      id: '1',
      month: '202601',
      label: '給料',
      amount: 300000,
      person: 'husband',
    },
    {
      id: '2',
      month: '202601',
      label: 'ボーナス',
      amount: 100000,
      person: 'wife',
    },
  ]

  it('収入一覧を表示する', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    expect(screen.getByText('給料')).toBeInTheDocument()
    expect(screen.getByText('ボーナス')).toBeInTheDocument()
  })

  it('合計金額を表示する', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    // 合計は400,000円
    expect(screen.getByText('¥400,000')).toBeInTheDocument()
  })

  it('各項目の金額を表示する', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    // 金額は +¥NNN,NNN 形式
    expect(screen.getByText('+¥300,000')).toBeInTheDocument()
    expect(screen.getByText('+¥100,000')).toBeInTheDocument()
  })

  it('収入がない場合メッセージを表示する', () => {
    render(<IncomeSection incomes={[]} month="202601" />)

    expect(screen.getByText('収入がありません')).toBeInTheDocument()
  })

  it('タイトル「収入」を表示する', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    // タイトルは "Income / 収入" 形式
    expect(screen.getByText('Income / 収入')).toBeInTheDocument()
  })

  it('担当者バッジを表示する', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    // PersonBadgeコンポーネントがレンダリングされることを確認
    // バッジとSelectオプションの両方に「夫」「妻」が存在するのでgetAllByTextを使用
    const husbandElements = screen.getAllByText('夫')
    const wifeElements = screen.getAllByText('妻')
    expect(husbandElements.length).toBeGreaterThanOrEqual(1)
    expect(wifeElements.length).toBeGreaterThanOrEqual(1)
  })

  it('削除ボタンにaria-labelが設定されている', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    expect(screen.getByRole('button', { name: '給料を削除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ボーナスを削除' })).toBeInTheDocument()
  })

  it('削除ボタンは競合クラスなしで44px以上のタッチ領域を持つ', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    const deleteButton = screen.getByRole('button', { name: '給料を削除' })
    expect(deleteButton).toHaveClass('size-11')
    expect(deleteButton).not.toHaveClass('h-9', 'w-9')
  })

  it('編集ボタンにaria-labelが設定されている', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    expect(screen.getByRole('button', { name: '給料を編集' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ボーナスを編集' })).toBeInTheDocument()
  })

  it('行アクションはキーボードフォーカス時にも可視化される', () => {
    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    expect(screen.getByRole('button', { name: '給料を削除' }).parentElement).toHaveClass(
      'md:group-focus-within:opacity-100'
    )
  })

  it('削除前に確認し、失敗時はエラーtoastを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteIncome).mockResolvedValueOnce({
      success: false,
      error: '収入の削除に失敗しました',
    })

    render(<IncomeSection incomes={mockIncomes} month="202601" />)

    await user.click(screen.getByRole('button', { name: '給料を削除' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('「給料」を削除しますか？')).toBeInTheDocument()
    expect(deleteIncome).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '削除する' }))

    expect(deleteIncome).toHaveBeenCalledWith('1', '202601')
    expect(toast.error).toHaveBeenCalledWith('収入の削除に失敗しました')
  })
})
