import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddEntryForm } from '@/features/add-entry/components/add-entry-form'
import { createIncome } from '@/app/actions/income'
import { createExpense } from '@/app/actions/expense'
import { createCarryover } from '@/app/actions/carryover'

vi.mock('@/app/actions/income', () => ({ createIncome: vi.fn() }))
vi.mock('@/app/actions/expense', () => ({ createExpense: vi.fn() }))
vi.mock('@/app/actions/carryover', () => ({ createCarryover: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

function fillRequiredFields(label: string, amount: string) {
  fireEvent.change(screen.getByLabelText('項目名'), { target: { value: label } })
  fireEvent.change(screen.getByLabelText('金額'), { target: { value: amount } })
}

describe('AddEntryForm', () => {
  it('支出の担当者と繰越フラグを送信し、成功後にフォームを初期化する', async () => {
    const onSuccess = vi.fn()
    vi.mocked(createExpense).mockImplementation(async (formData) => {
      expect(Object.fromEntries(formData)).toMatchObject({
        month: '202607',
        label: '家賃',
        amount: '120000',
        person: 'wife',
        is_carryover: 'true',
      })
      return { success: true }
    })
    render(
      <AddEntryForm
        type="expense"
        month="202607"
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    )

    fillRequiredFields('家賃', '120000')
    fireEvent.click(screen.getByRole('radio', { name: '妻' }))
    fireEvent.click(screen.getByRole('switch', { name: '繰越扱いにする' }))
    fireEvent.click(screen.getByRole('button', { name: '支出を追加' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('項目名')).toHaveValue('')
    expect(screen.getByRole('radio', { name: '夫' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: '繰越扱いにする' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('繰越の清算フラグを送信し、既定のエラーを表示する', async () => {
    vi.mocked(createCarryover).mockResolvedValue({ success: false })
    render(
      <AddEntryForm
        type="carryover"
        month="202607"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    fillRequiredFields('先月分', '5000')
    fireEvent.click(screen.getByRole('switch', { name: '今月で清算する' }))
    fireEvent.click(screen.getByRole('button', { name: '繰越を追加' }))

    expect(await screen.findByText('追加に失敗しました')).toBeInTheDocument()
    expect(vi.mocked(createCarryover).mock.calls[0][0].get('is_cleared')).toBe('true')
  })

  it('収入のActionエラーを表示し、キャンセル操作を通知する', async () => {
    const onCancel = vi.fn()
    vi.mocked(createIncome).mockResolvedValue({ success: false, error: '登録できません' })
    render(
      <AddEntryForm
        type="income"
        month="202607"
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledOnce()

    fillRequiredFields('給与', '300000')
    fireEvent.click(screen.getByRole('button', { name: '収入を追加' }))

    expect(await screen.findByText('登録できません')).toBeInTheDocument()
  })
})
