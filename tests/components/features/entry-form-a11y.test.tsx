import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddEntryForm } from '@/features/add-entry/components/add-entry-form'
import { AddEntryModal } from '@/features/add-entry/components/add-entry-modal'
import { AddEntrySheet } from '@/features/add-entry/components/add-entry-sheet'
import { EditModal } from '@/features/edit-entry'
import { createIncome } from '@/app/actions/income'

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

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('追加シートは説明を関連付け、Missing Description警告を出さない', () => {
    const consoleError = vi.spyOn(console, 'error')
    const consoleWarn = vi.spyOn(console, 'warn')

    render(
      <AddEntrySheet
        open
        onOpenChange={() => {}}
        month="202601"
      />
    )

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      '収入・支出・繰越の内容と担当者を入力します。'
    )
    expect([...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join(' ')).not.toMatch(
      /Missing `Description`|aria-describedby/
    )
  })

  it('追加モーダルは説明と44pxの起動操作を持つ', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error')
    const consoleWarn = vi.spyOn(console, 'warn')

    render(<AddEntryModal type="income" month="202601" />)

    const trigger = screen.getByRole('button', { name: '項目を追加' })
    expect(trigger).toHaveClass('min-h-11')
    await user.click(trigger)

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      '収入の内容と担当者を入力します。'
    )
    expect([...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join(' ')).not.toMatch(
      /Missing `Description`|aria-describedby/
    )
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

  it('編集モーダルは説明を関連付け、Escape後に起動操作へフォーカスを戻す', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error')
    const consoleWarn = vi.spyOn(console, 'warn')

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

    const trigger = screen.getByRole('button', { name: '給料を編集' })
    await user.click(trigger)

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      '収入の内容と担当者を編集します。'
    )
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('size-11')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect([...consoleError.mock.calls, ...consoleWarn.mock.calls].flat().join(' ')).not.toMatch(
      /Missing `Description`|aria-describedby/
    )
  })

  it('追加シートは送信成功後に種別と担当者を初期状態へ戻す', async () => {
    vi.mocked(createIncome).mockResolvedValue({ success: true })
    const handleOpenChange = vi.fn()
    const { rerender } = render(
      <AddEntrySheet
        open
        onOpenChange={handleOpenChange}
        month="202601"
      />
    )

    fireEvent.click(screen.getByRole('radio', { name: '収入' }))
    fireEvent.click(screen.getByRole('radio', { name: '妻' }))
    fireEvent.change(screen.getByLabelText('項目名'), {
      target: { value: '副業' },
    })
    fireEvent.change(screen.getByLabelText('金額'), {
      target: { value: '12000' },
    })
    fireEvent.click(screen.getByRole('button', { name: '収入を追加' }))
    await waitFor(() => expect(handleOpenChange).toHaveBeenCalledWith(false))

    rerender(
      <AddEntrySheet
        open={false}
        onOpenChange={handleOpenChange}
        month="202601"
      />
    )
    rerender(
      <AddEntrySheet
        open
        onOpenChange={handleOpenChange}
        month="202601"
      />
    )

    expect(screen.getByRole('radio', { name: '支出' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('radio', { name: '夫' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })
})
