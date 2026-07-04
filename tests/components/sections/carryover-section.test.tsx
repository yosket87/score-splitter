import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { CarryoverSection } from '@/features/carryover'
import { deleteCarryover } from '@/app/actions/carryover'
import type { Carryover } from '@/types'

// Server Actionsのモック
vi.mock('@/app/actions/carryover', () => ({
  createCarryover: vi.fn(),
  updateCarryover: vi.fn(),
  deleteCarryover: vi.fn(),
  toggleCarryoverCleared: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('CarryoverSection', () => {
  const mockCarryovers: Carryover[] = [
    {
      id: '1',
      month: '202601',
      label: '前月繰越',
      amount: -30000, // 繰越は負の値
      person: 'husband',
      isCleared: false,
    },
    {
      id: '2',
      month: '202601',
      label: '貯金から',
      amount: -20000,
      person: 'wife',
      isCleared: false,
    },
  ]

  it('タイトル「繰越」を表示する', () => {
    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    // タイトルは "Carryover / 繰越" 形式
    expect(screen.getByText('Carryover / 繰越')).toBeInTheDocument()
  })

  it('合計金額を表示する', () => {
    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    // 合計は絶対値の合計 ¥50,000
    expect(screen.getByText(/¥50,000/)).toBeInTheDocument()
  })

  it('常時展開されており項目が表示される', () => {
    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    // 折りたたみ廃止により常時表示
    expect(screen.getByText('前月繰越')).toBeInTheDocument()
    expect(screen.getByText('貯金から')).toBeInTheDocument()
  })

  it('繰越がない場合メッセージを表示する', () => {
    render(<CarryoverSection carryovers={[]} month="202601" />)

    expect(screen.getByText('繰越がありません')).toBeInTheDocument()
  })

  it('担当者テキストを表示する', () => {
    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    // PersonBadge廃止、spanで夫/妻テキスト表示
    const husbandElements = screen.getAllByText('夫')
    const wifeElements = screen.getAllByText('妻')
    expect(husbandElements.length).toBeGreaterThanOrEqual(1)
    expect(wifeElements.length).toBeGreaterThanOrEqual(1)
  })

  it('清算済み繰越に「清算済」バッジを表示する', () => {
    const carryoversWithCleared: Carryover[] = [
      {
        id: '1',
        month: '202601',
        label: '前月繰越',
        amount: -30000,
        person: 'husband',
        isCleared: true,
      },
      {
        id: '2',
        month: '202601',
        label: '貯金から',
        amount: -20000,
        person: 'wife',
        isCleared: false,
      },
    ]

    render(<CarryoverSection carryovers={carryoversWithCleared} month="202601" />)

    // 清算済バッジが表示される（折りたたみ不要）
    expect(screen.getByText('清算済')).toBeInTheDocument()
  })

  it('清算済み繰越は取り消し線スタイルで表示する', () => {
    const carryoversWithCleared: Carryover[] = [
      {
        id: '1',
        month: '202601',
        label: '前月繰越',
        amount: -30000,
        person: 'husband',
        isCleared: true,
      },
    ]

    render(<CarryoverSection carryovers={carryoversWithCleared} month="202601" />)

    // ラベルに取り消し線クラスが適用される（折りたたみ不要）
    const labelElement = screen.getByText('前月繰越')
    expect(labelElement).toHaveClass('line-through')
  })

  it('清算済み件数をヘッダーに表示する', () => {
    const carryoversWithCleared: Carryover[] = [
      {
        id: '1',
        month: '202601',
        label: '前月繰越',
        amount: -30000,
        person: 'husband',
        isCleared: true,
      },
      {
        id: '2',
        month: '202601',
        label: '貯金から',
        amount: -20000,
        person: 'wife',
        isCleared: false,
      },
    ]

    render(<CarryoverSection carryovers={carryoversWithCleared} month="202601" />)

    // 清算済み件数がヘッダーに表示される
    expect(screen.getByText(/清算済み\s+1件/)).toBeInTheDocument()
  })

  it('削除前に確認し、失敗時はエラーtoastを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(deleteCarryover).mockResolvedValueOnce({
      success: false,
      error: '繰越の削除に失敗しました',
    })

    render(<CarryoverSection carryovers={mockCarryovers} month="202601" />)

    await user.click(screen.getByRole('button', { name: '前月繰越を削除' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('「前月繰越」を削除しますか？')).toBeInTheDocument()
    expect(deleteCarryover).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '削除する' }))

    expect(deleteCarryover).toHaveBeenCalledWith('1')
    expect(toast.error).toHaveBeenCalledWith('繰越の削除に失敗しました')
  })
})
