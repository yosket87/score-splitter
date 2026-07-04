import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroSection } from '@/features/monthly-overview'
import type { Income } from '@/types'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
  }),
}))

vi.mock('@/features/copy-month', () => ({
  CopyMonthDialog: () => <button type="button">前月からコピー</button>,
}))

vi.mock('@/features/export-csv', () => ({
  ExportCsvButton: () => <button type="button">CSV出力</button>,
}))

vi.mock('@/components/layout/header-actions', () => ({
  HeaderActions: () => <div aria-label="ヘッダー操作" />,
}))

describe('HeroSection', () => {
  it('月移動ボタンに44px以上のタッチ領域がある', () => {
    render(
      <HeroSection
        currentMonth="202604"
        incomes={[]}
        expenses={[]}
        carryovers={[]}
      />
    )

    expect(screen.getByRole('button', { name: '前月に移動' })).toHaveClass('h-11', 'w-11')
    expect(screen.getByRole('button', { name: '翌月に移動' })).toHaveClass('h-11', 'w-11')
    expect(screen.getByRole('button', { name: '今月に移動' })).toHaveClass('h-11')
  })

  it('負の精算額では妻から夫への方向を表示する', () => {
    const incomes: Income[] = [
      {
        id: 'income-1',
        month: '202604',
        label: '夫手取り',
        amount: 100000,
        person: 'husband',
      },
      {
        id: 'income-2',
        month: '202604',
        label: '妻手取り',
        amount: 500000,
        person: 'wife',
      },
    ]

    render(
      <HeroSection
        currentMonth="202604"
        incomes={incomes}
        expenses={[]}
        carryovers={[]}
      />
    )

    expect(screen.getByText('妻 → 夫')).toBeInTheDocument()
  })
})
