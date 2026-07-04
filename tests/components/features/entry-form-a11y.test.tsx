import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddEntryForm } from '@/features/add-entry/components/add-entry-form'
import { AddEntrySheet } from '@/features/add-entry/components/add-entry-sheet'
import { EditModal } from '@/features/edit-entry'

vi.mock('@/app/actions/income', () => ({
  createIncome: vi.fn(),
  updateIncome: vi.fn(),
}))

vi.mock('@/app/actions/expense', () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
}))

vi.mock('@/app/actions/carryover', () => ({
  createCarryover: vi.fn(),
  updateCarryover: vi.fn(),
}))

describe('entry form a11y', () => {
  it('追加フォームの項目名・金額入力がlabelで取得できる', () => {
    render(
      <AddEntryForm
        type="expense"
        month="202601"
        onSuccess={() => {}}
        onCancel={() => {}}
      />
    )

    expect(screen.getByLabelText('項目名')).toHaveAttribute('name', 'label')
    expect(screen.getByLabelText('金額')).toHaveAttribute('name', 'amount')
    expect(screen.getByRole('radiogroup', { name: '担当者' })).toBeInTheDocument()
  })

  it('追加シートの項目名・金額入力がlabelで取得でき、種別タブがradioになる', () => {
    render(
      <AddEntrySheet
        open
        onOpenChange={() => {}}
        month="202601"
      />
    )

    expect(screen.getByLabelText('項目名')).toHaveAttribute('name', 'label')
    expect(screen.getByLabelText('金額')).toHaveAttribute('name', 'amount')
    expect(screen.getByRole('radiogroup', { name: '項目種別' })).toHaveClass('h-11')
    expect(screen.getByRole('radio', { name: '支出' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: '保存' })).toHaveClass('min-h-11')
  })

  it('編集フォームの項目名・金額入力がlabelで取得できる', async () => {
    const user = userEvent.setup()

    render(
      <EditModal
        id="income-1"
        month="202601"
        label="給料"
        amount={300000}
        person="husband"
        type="income"
        onUpdate={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '給料を編集' }))

    expect(screen.getByLabelText('項目名')).toHaveAttribute('name', 'label')
    expect(screen.getByLabelText('金額')).toHaveAttribute('name', 'amount')
    expect(screen.getByRole('radiogroup', { name: '担当者' })).toBeInTheDocument()
  })
})
