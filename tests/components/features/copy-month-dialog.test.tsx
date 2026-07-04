import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyMonthDialog } from '@/features/copy-month'
import { copyMonthData, getCopyMonthPreview } from '@/app/actions/copy-month'

vi.mock('@/app/actions/copy-month', () => ({
  copyMonthData: vi.fn(),
  getCopyMonthPreview: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('CopyMonthDialog', () => {
  it('置換モードでは既存データ削除の確認後にコピーする', async () => {
    const user = userEvent.setup()
    vi.mocked(getCopyMonthPreview).mockResolvedValueOnce({
      success: true,
      data: {
        sourceMonth: '202603',
        targetMonth: '202604',
        existingCount: 2,
        carryoverCount: 0,
        items: [
          {
            id: 'income-1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
          },
        ],
      },
    })
    vi.mocked(copyMonthData).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        copied: { incomes: 1, expenses: 0, carryovers: 0 },
        skipped: { incomes: 0, expenses: 0, carryovers: 0 },
      },
    })

    render(
      <CopyMonthDialog
        currentMonth="202604"
        previousMonth="202603"
      />
    )

    await user.click(screen.getByRole('button', { name: '前月からコピー' }))
    await screen.findByText('既存データの処理')

    await user.click(screen.getAllByRole('combobox')[1])
    await user.click(
      await screen.findByRole('option', {
        name: '置換（既存データを削除してコピー）',
      })
    )
    await user.click(screen.getByRole('button', { name: 'コピーする (1件)' }))

    expect(copyMonthData).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '既存の2件を削除してコピーします'
    )

    await user.click(screen.getByRole('button', { name: '既存データを削除してコピー' }))

    await waitFor(() => {
      expect(copyMonthData).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'replace',
          sourceMonth: '202603',
          targetMonth: '202604',
        })
      )
    })
  })
})
