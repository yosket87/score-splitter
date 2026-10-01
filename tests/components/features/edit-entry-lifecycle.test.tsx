import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditModal } from '@/features/edit-entry'

// 終了アニメーション中はPortalが本文を保持する条件を再現する。
vi.mock('@/components/ui/responsive-modal', () => ({
  ResponsiveModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

it('閉じる途中は編集内容を保持し、終了前に再び開いても保存値で初期化する', () => {
  const props = {
    id: 'expense-1', month: '202602', label: '食費', amount: -32000,
    person: 'wife' as const, type: 'expense' as const, trigger: null,
    onUpdate: vi.fn(),
  }
  const { rerender } = render(<EditModal {...props} open />)
  fireEvent.change(screen.getByLabelText('項目名'), { target: { value: '編集中' } })
  fireEvent.change(screen.getByLabelText('金額'), { target: { value: '12345' } })
  fireEvent.click(screen.getByRole('radio', { name: '夫' }))
  rerender(<EditModal {...props} open={false} />)
  expect(screen.getByLabelText('項目名')).toHaveValue('編集中')
  expect(screen.getByLabelText('金額')).toHaveValue(12345)
  rerender(<EditModal {...props} open />)
  expect(screen.getByLabelText('項目名')).toHaveValue('食費')
  expect(screen.getByLabelText('金額')).toHaveValue(32000)
  expect(screen.getByRole('radio', { name: '妻' })).toHaveAttribute('aria-checked', 'true')
})
