import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CarryoverSection } from '@/features/carryover'
import { PersonSelector } from '@/components/ui/person-selector'
import type { Carryover } from '@/types'

vi.mock('@/app/actions/carryover', () => ({
  createCarryover: vi.fn(),
  updateCarryover: vi.fn(),
  deleteCarryover: vi.fn(),
  toggleCarryoverCleared: vi.fn(),
}))

const mockCarryovers: Carryover[] = [
  {
    id: '1',
    month: '202601',
    label: '前月繰越',
    amount: -30000,
    person: 'husband',
    isCleared: false,
  },
]

describe('CarryoverSection a11y', () => {
  it('carryover-title が h3 要素である', () => {
    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    const title = screen.getByTestId('carryover-title')
    expect(title.tagName).toBe('H3')
  })

  it('項目が常時表示される（折りたたみ廃止）', () => {
    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    // 折りたたみ廃止により初期状態から項目が表示される
    expect(screen.getByText('前月繰越')).toBeInTheDocument()
  })

  it('清算ボタンに aria-label が設定されている', () => {
    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    expect(
      screen.getByRole('button', { name: '前月繰越を清算する' })
    ).toBeInTheDocument()
  })

  it('担当者選択が radiogroup と radio の選択状態を持つ', () => {
    render(<PersonSelector value="husband" onChange={() => {}} />)

    expect(screen.getByRole('radiogroup', { name: '担当者' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '夫' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('radio', { name: '妻' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })
})
