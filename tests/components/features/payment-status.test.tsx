import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentStatusPanel } from '@/features/payment-status'
import { calculateSettlement } from '@/lib/utils/calculation'
import type { PaymentStatus } from '@/types/payment-status'
const actions = vi.hoisted(() => ({ getPaymentStatus: vi.fn(), recordPayment: vi.fn(), correctPayment: vi.fn(), getPaymentOperation: vi.fn() }))
vi.mock('@/app/actions/payment-status', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const status: PaymentStatus = { month: '202609', revision: 1, calculation: calculateSettlement([], [], []), targetSignedYen: 15500, netPaidSignedYen: 0, remainingSignedYen: 15500, state: 'unpaid', payments: [] }
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); actions.getPaymentStatus.mockResolvedValue({ success: true, data: status }) })
describe('振込状況', () => {
  it('最新額を確認して振込を記録する', async () => {
    actions.recordPayment.mockResolvedValue({ success: true, data: { operationId: 'done' } })
    render(<PaymentStatusPanel month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('15,500')
    await userEvent.click(screen.getByRole('button', { name: '振込済みとして記録' }))
    await waitFor(() => expect(actions.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ confirmedSignedYen: 15500, expectedRevision: 1 })))
  })
  it('逆方向の差額を表示する', () => {
    render(<PaymentStatusPanel month="202609" initialResult={{ success: true, data: { ...status, state: 'difference', netPaidSignedYen: 15500, remainingSignedYen: -5500 } }} />)
    expect(screen.getByText('差額あり')).toBeInTheDocument()
    expect(screen.getByText(/妻 → 夫.*5,500/)).toBeInTheDocument()
  })
  it('取得失敗を振込不要として扱わない', () => {
    render(<PaymentStatusPanel month="202609" initialResult={{ success: false, error: '取得できませんでした', code: 500 }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('取得できませんでした')
    expect(screen.queryByText('振込不要')).not.toBeInTheDocument()
  })
  it('応答消失後に同じ入力と操作番号で再送する', async () => {
    actions.recordPayment.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ success: true, data: {} })
    render(<PaymentStatusPanel month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
    await userEvent.click(await screen.findByRole('button', { name: '振込済みとして記録' }))
    await userEvent.click(await screen.findByRole('button', { name: '同じ内容で再送' }))
    expect(actions.recordPayment.mock.calls[1][0]).toEqual(actions.recordPayment.mock.calls[0][0])
  })
  it('振込不要の月では記録ボタンを出さない', () => {
    render(<PaymentStatusPanel month="202609" initialResult={{ success: true, data: { ...status, state: 'unnecessary', targetSignedYen: 0, remainingSignedYen: 0 } }} />)
    expect(screen.getByText('振込不要')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '振込済みにする' })).not.toBeInTheDocument()
  })
  it('確認後の競合では再取得を行い新しい確認を要求する', async () => {
    actions.recordPayment.mockResolvedValue({ success: false, code: 409, error: '明細が更新されました。もう一度確認してください。' })
    render(<PaymentStatusPanel month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
    await userEvent.click(await screen.findByRole('button', { name: '振込済みとして記録' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('明細が更新されました')
    expect(sessionStorage.getItem('payment-operation:202609')).toBeNull()
    expect(screen.getByRole('button', { name: '振込済みにする' })).toBeEnabled()
  })
  it('再読込後も保存済み操作の結果を照会する', async () => {
    const input = { month: '202609', operationId: 'persisted-id', expectedRevision: 1, confirmedSignedYen: 15500, paidOn: '2026-09-01' }
    sessionStorage.setItem('payment-operation:202609', JSON.stringify({ kind: 'record', input }))
    actions.getPaymentOperation.mockResolvedValue({ success: true, data: { operationId: 'persisted-id' } })
    render(<PaymentStatusPanel month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(await screen.findByRole('button', { name: '結果を確認' }))
    await waitFor(() => expect(actions.getPaymentOperation).toHaveBeenCalledWith('202609', 'persisted-id'))
    expect(actions.recordPayment).not.toHaveBeenCalled()
    await waitFor(() => expect(sessionStorage.getItem('payment-operation:202609')).toBeNull())
  })
  it('履歴の金額と支払日を訂正する', async () => {
    const paid: PaymentStatus = { ...status, state: 'paid', netPaidSignedYen: 15500, remainingSignedYen: 0, payments: [{ id: 'payment-id', month: '202609', signedYen: 15500, paidOn: '2026-09-01', createdAt: '2026-09-01T00:00:00Z', actor: { person: null, authMethod: 'password' }, snapshot: { schemaVersion: 1, incomes: [], expenses: [], carryovers: [], calculation: status.calculation, calculationVersion: 'equal-surplus-v1', roundingVersion: 'toward-zero-yen-v1' }, voidedAt: null, voidReason: null }] }
    actions.getPaymentStatus.mockResolvedValue({ success: true, data: paid })
    actions.correctPayment.mockResolvedValue({ success: true, data: {} })
    render(<PaymentStatusPanel month="202609" initialResult={{ success: true, data: paid }} />)
    await userEvent.click(screen.getByRole('button', { name: '記録を見る' }))
    expect(screen.getByText(/共有ログインによる記録/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '記録を訂正' }))
    const amount = await screen.findByRole('spinbutton', { name: '実際の振込額（円）' })
    await userEvent.clear(amount)
    await userEvent.type(amount, '15000')
    await userEvent.type(screen.getByRole('textbox', { name: '訂正理由' }), '金額の誤記')
    await userEvent.click(screen.getByRole('button', { name: '訂正を記録する' }))
    await waitFor(() => expect(actions.correctPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'payment-id', reason: '金額の誤記', replacement: { signedYen: 15000, paidOn: '2026-09-01' } })))
  })

})
