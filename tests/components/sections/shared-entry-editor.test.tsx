import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IncomeSection } from '@/features/income'
import { ExpenseSection } from '@/features/expense'
import { CarryoverSection } from '@/features/carryover'
import { updateIncome } from '@/app/actions/income'
import { updateExpense } from '@/app/actions/expense'
import { updateCarryover } from '@/app/actions/carryover'
import type { EntryType } from '@/types'

vi.mock('@/app/actions/income', () => ({ createIncome: vi.fn(), updateIncome: vi.fn(), deleteIncome: vi.fn() }))
vi.mock('@/app/actions/expense', () => ({
  createExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(), toggleExpenseCarryover: vi.fn(),
}))
vi.mock('@/app/actions/carryover', () => ({
  createCarryover: vi.fn(), updateCarryover: vi.fn(), deleteCarryover: vi.fn(), toggleCarryoverCleared: vi.fn(),
}))
vi.mock('@/components/animations/lottie-player', () => ({ LottiePlayer: () => null }))
// 閉じているモーダルも数え、項目数に比例するインスタンスの再導入を検出する。
vi.mock('@/features/edit-entry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/edit-entry')>()
  return {
    ...actual,
    EditModal: (props: Parameters<typeof actual.EditModal>[0]) => (
      <div data-testid="edit-instance"><actual.EditModal {...props} /></div>
    ),
  }
})

function section(type: EntryType, count = 2) {
  const entries = Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`, month: '202602', label: `項目${i}`,
    amount: (type === 'income' ? 1 : -1) * (i + 1) * 100,
    person: i === 0 ? 'husband' as const : 'wife' as const,
    isCarryover: i !== 0, isCleared: i !== 0,
  }))
  if (type === 'income') return <IncomeSection incomes={entries} month="202602" />
  if (type === 'expense') return <ExpenseSection expenses={entries} month="202602" />
  return <CarryoverSection carryovers={entries} month="202602" />
}

beforeEach(() => vi.clearAllMocks())

for (const [type, update] of [
  ['income', updateIncome], ['expense', updateExpense], ['carryover', updateCarryover],
] as const) {
  describe(`${type}の共有編集モーダル`, () => {
    it('複数行でも編集インスタンスは選択した1件だけ', async () => {
      const user = userEvent.setup()
      render(section(type, 8))
      expect(screen.queryAllByTestId('edit-instance')).toHaveLength(0)
      await user.click(screen.getByRole('button', { name: '項目0を編集' }))
      expect(screen.getAllByTestId('edit-instance')).toHaveLength(1)
      await user.click(screen.getByRole('button', { name: 'キャンセル' }))
      await user.click(screen.getByRole('button', { name: '項目7を編集' }))
      expect(screen.getAllByTestId('edit-instance')).toHaveLength(1)
      expect(screen.getByLabelText('項目名')).toHaveValue('項目7')
    })

    it('キャンセル後に別の行の保存値と状態で編集し、正しいIDだけを更新する', async () => {
      const user = userEvent.setup()
      vi.mocked(update).mockResolvedValue({ success: true })
      render(section(type))
      const firstTrigger = screen.getByRole('button', { name: '項目0を編集' })
      await user.click(firstTrigger)
      await user.clear(screen.getByLabelText('項目名'))
      await user.type(screen.getByLabelText('項目名'), '未保存')
      await user.click(screen.getByRole('radio', { name: '妻' }))
      await user.click(screen.getByRole('button', { name: 'キャンセル' }))
      await waitFor(() => expect(firstTrigger).toHaveFocus())
      const secondTrigger = screen.getByRole('button', { name: '項目1を編集' })
      await user.click(secondTrigger)
      expect(screen.getByLabelText('項目名')).toHaveValue('項目1')
      expect(screen.getByLabelText('金額')).toHaveValue(200)
      expect(screen.getByRole('radio', { name: '妻' })).toHaveAttribute('aria-checked', 'true')
      await user.click(screen.getByRole('button', { name: '更新' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(update).toHaveBeenCalledTimes(1)
      const [id, data] = vi.mocked(update).mock.calls[0]
      expect(id).toBe('entry-1')
      expect(Object.fromEntries(data)).toMatchObject({ month: '202602', label: '項目1', amount: '200', person: 'wife' })
      if (type === 'expense') expect(data.get('is_carryover')).toBe('true')
      if (type === 'carryover') expect(data.get('is_cleared')).toBe('true')
      await waitFor(() => expect(secondTrigger).toHaveFocus())
    })

    it('更新エラーは選択中の行に残り、再オープンでは消える', async () => {
      const user = userEvent.setup()
      vi.mocked(update).mockResolvedValue({ success: false, error: '更新できません' })
      render(section(type))
      await user.click(screen.getByRole('button', { name: '項目0を編集' }))
      await user.click(screen.getByRole('button', { name: '更新' }))
      expect(await screen.findByText('更新できません')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'キャンセル' }))
      await user.click(screen.getByRole('button', { name: '項目1を編集' }))
      expect(screen.queryByText('更新できません')).not.toBeInTheDocument()
    })

    it.each([0, 1])('古い保存応答が再オープンした項目%dを閉じない', async (target) => {
      const user = userEvent.setup()
      let resolveUpdate!: () => void
      vi.mocked(update).mockReturnValueOnce(new Promise<{ success: true }>((resolve) => { resolveUpdate = () => resolve({ success: true }) }))
      render(section(type))
      await user.click(screen.getByRole('button', { name: '項目0を編集' }))
      await user.click(screen.getByRole('button', { name: '更新' }))
      expect(update).toHaveBeenCalledTimes(1)
      await user.click(screen.getByRole('button', { name: 'キャンセル' }))
      await user.click(screen.getByRole('button', { name: `項目${target}を編集` }))
      await user.clear(screen.getByLabelText('項目名'))
      await user.type(screen.getByLabelText('項目名'), '次の編集')
      await act(async () => { resolveUpdate() })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByLabelText('項目名')).toHaveValue('次の編集')
    })

    it('空の一覧では編集モーダルを生成しない', () => {
      render(section(type, 0))
      expect(screen.queryAllByTestId('edit-instance')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: /を編集$/ })).not.toBeInTheDocument()
    })
  })
}
