import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CopyMonthDialog } from '@/features/copy-month'
import { ExportCsvButton } from '@/features/export-csv'

vi.mock('@/app/actions/copy-month', () => ({
  getCopyMonthPreview: vi.fn(),
  copyMonthData: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

describe('月次アクションボタンのアクセシビリティ', () => {
  it('前月コピーのアイコンボタンにアクセシブルネームがある', () => {
    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    expect(screen.getByRole('button', { name: '前月からコピー' })).toHaveAttribute(
      'aria-label',
      '前月からコピー'
    )
  })

  it('CSV出力のアイコンボタンにアクセシブルネームがある', () => {
    render(
      <ExportCsvButton
        currentMonth="202604"
        incomes={[]}
        expenses={[]}
        carryovers={[]}
      />
    )

    expect(screen.getByRole('button', { name: 'CSV出力' })).toHaveAttribute(
      'aria-label',
      'CSV出力'
    )
  })

  it('CSV出力ボタンは768px相当でも44px以上の高さを保つ', () => {
    render(
      <ExportCsvButton
        currentMonth="202604"
        incomes={[]}
        expenses={[]}
        carryovers={[]}
      />
    )

    const button = screen.getByRole('button', { name: 'CSV出力' })
    expect(button).toHaveClass('h-11')
    expect(button).not.toHaveClass('sm:h-8')
  })
})
