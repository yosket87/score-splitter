import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentStatusPanel } from '@/features/payment-status'
import { calculateSettlement } from '@/lib/utils/calculation'
import type { PaymentStatus } from '@/types/payment-status'
const actions = vi.hoisted(() => ({ getPaymentStatus: vi.fn(), recordPayment: vi.fn(), correctPayment: vi.fn(), getPaymentOperation: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/actions/payment-status', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
const status: PaymentStatus = { month: '202609', revision: 1, calculation: calculateSettlement([], [], []), targetSignedYen: 15500, netPaidSignedYen: 0, remainingSignedYen: 15500, state: 'unpaid', payments: [] }
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); actions.getPaymentStatus.mockResolvedValue({ success: true, data: status }) })
describe('振込状況', () => {
  it('最新額を確認して振込を記録する', async () => {
    actions.recordPayment.mockResolvedValue({ success: true, data: { operationId: 'done' } })
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('15,500')
    await userEvent.click(screen.getByRole('button', { name: '振込済みとして記録' }))
    await waitFor(() => expect(actions.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ confirmedSignedYen: 15500, expectedRevision: 1 })))
  })
  it('逆方向の差額を表示する', () => {
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: { ...status, state: 'difference', netPaidSignedYen: 15500, remainingSignedYen: -5500 } }} />)
    expect(screen.getByText('差額あり')).toBeInTheDocument()
    expect(screen.getByText(/妻 → 夫.*5,500/)).toBeInTheDocument()
  })
  it('取得失敗を振込不要として扱わない', () => {
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: false, error: '取得できませんでした', code: 500 }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('取得できませんでした')
    expect(screen.queryByText('振込不要')).not.toBeInTheDocument()
  })
  it('応答消失後に同じ入力と操作番号で再送する', async () => {
    actions.recordPayment.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ success: true, data: {} })
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
    await userEvent.click(await screen.findByRole('button', { name: '振込済みとして記録' }))
    await userEvent.click(await screen.findByRole('button', { name: '同じ内容で再送' }))
    expect(actions.recordPayment.mock.calls[1][0]).toEqual(actions.recordPayment.mock.calls[0][0])
  })
  it('振込不要の月では記録ボタンを出さない', () => {
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: { ...status, state: 'unnecessary', targetSignedYen: 0, remainingSignedYen: 0 } }} />)
    expect(screen.getByText('振込不要')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '振込済みにする' })).not.toBeInTheDocument()
  })
  it('確認後の競合では再取得を行い新しい確認を要求する', async () => {
    actions.recordPayment.mockResolvedValue({ success: false, code: 409, error: '明細が更新されました。もう一度確認してください。' })
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
    await userEvent.click(await screen.findByRole('button', { name: '振込済みとして記録' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('明細が更新されました')
    expect(sessionStorage.getItem('payment-operation:A:202609')).toBeNull()
    expect(screen.getByRole('button', { name: '振込済みにする' })).toBeEnabled()
  })
  it('再読込後も保存済み操作の結果を照会する', async () => {
    const input = { month: '202609', operationId: 'persisted-id', expectedRevision: 1, confirmedSignedYen: 15500, paidOn: '2026-09-01' }
    sessionStorage.setItem('payment-operation:A:202609', JSON.stringify({ kind: 'record', input }))
    actions.getPaymentOperation.mockResolvedValue({ success: true, data: { operationId: 'persisted-id' } })
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
    await userEvent.click(await screen.findByRole('button', { name: '結果を確認' }))
    await waitFor(() => expect(actions.getPaymentOperation).toHaveBeenCalledWith('202609', 'persisted-id'))
    expect(actions.recordPayment).not.toHaveBeenCalled()
    await waitFor(() => expect(sessionStorage.getItem('payment-operation:A:202609')).toBeNull())
  })
  it('履歴の金額と支払日を訂正する', async () => {
    const paid: PaymentStatus = { ...status, state: 'paid', netPaidSignedYen: 15500, remainingSignedYen: 0, payments: [{ id: 'payment-id', month: '202609', signedYen: 15500, paidOn: '2026-09-01', createdAt: '2026-09-01T00:00:00Z', actor: { person: null, authMethod: 'password' }, snapshot: { schemaVersion: 1, incomes: [], expenses: [], carryovers: [], calculation: status.calculation, calculationVersion: 'equal-surplus-v1', roundingVersion: 'toward-zero-yen-v1' }, voidedAt: null, voidReason: null }] }
    actions.getPaymentStatus.mockResolvedValue({ success: true, data: paid })
    actions.correctPayment.mockResolvedValue({ success: true, data: {} })
    render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: paid }} />)
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

it('Aの遅い記録応答はBの画面・保存操作・再取得へ影響しない', async () => {
  const response = deferred<{ success: true; data: object }>()
  actions.recordPayment.mockReturnValue(response.promise)
  const view = render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
  await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
  await userEvent.click(await screen.findByRole('button', { name: '振込済みとして記録' }))
  const aPending = sessionStorage.getItem('payment-operation:A:202609')
  expect(aPending).not.toBeNull()
  const bPending = JSON.stringify({ kind: 'record', input: { month: '202609', operationId: 'B-operation' } })
  sessionStorage.setItem('payment-operation:B:202609', bPending)
  view.rerender(<PaymentStatusPanel householdId="B" month="202609" initialResult={{ success: true, data: { ...status, remainingSignedYen: 1 } }} />)
  const calls = actions.getPaymentStatus.mock.calls.length
  await act(async () => response.resolve({ success: true, data: {} }))
  expect(sessionStorage.getItem('payment-operation:A:202609')).toBe(aPending)
  expect(sessionStorage.getItem('payment-operation:B:202609')).toBe(bPending)
  expect(actions.getPaymentStatus).toHaveBeenCalledTimes(calls)
  expect(actions.refresh).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '結果を確認' })).toBeEnabled()
})

it('旧操作は入力を移管せず結果照会だけを許し、他世帯で不存在でも再送しない', async () => {
  const legacy = JSON.stringify({ kind: 'record', input: { month: '202609', operationId: 'old-operation', confirmedSignedYen: 99999 } })
  sessionStorage.setItem('payment-operation:202609', legacy)
  actions.getPaymentOperation.mockResolvedValue({ success: true, data: null })
  render(<PaymentStatusPanel householdId="B" month="202609" initialResult={{ success: true, data: status }} />)
  expect(screen.queryByRole('button', { name: '同じ内容で再送' })).not.toBeInTheDocument()
  expect(screen.queryByText(/99,999/)).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: '結果を確認' }))
  expect(actions.getPaymentOperation).toHaveBeenCalledWith('202609', 'old-operation')
  expect(actions.recordPayment).not.toHaveBeenCalled()
  expect(sessionStorage.getItem('payment-operation:B:202609')).toBeNull()
  expect(sessionStorage.getItem('payment-operation:202609')).toBe(legacy)
})

it('Aの確認取得がBの記録中に完了してもBのbusyと確認画面を変えない', async () => {
  const a = deferred<{ success: true; data: PaymentStatus }>()
  const b = deferred<{ success: true; data: PaymentStatus }>()
  actions.getPaymentStatus.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  const view = render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
  await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
  view.rerender(<PaymentStatusPanel householdId="B" month="202609" initialResult={{ success: true, data: status }} />)
  await userEvent.click(screen.getByRole('button', { name: '振込済みにする' }))
  await act(async () => a.resolve({ success: true, data: { ...status, remainingSignedYen: 99999 } }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '振込済みにする' })).toBeDisabled()
  await act(async () => b.resolve({ success: true, data: { ...status, remainingSignedYen: 1 } }))
  expect(screen.getByRole('dialog')).toHaveTextContent('1円')
  expect(screen.queryByText(/99,999/)).not.toBeInTheDocument()
})

it('旧操作の所属内照会が成功したときだけ旧キーを削除する', async () => {
  sessionStorage.setItem('payment-operation:202609', JSON.stringify({ kind: 'record', input: { month: '202609', operationId: 'old-operation' } }))
  actions.getPaymentOperation.mockResolvedValue({ success: true, data: { operationId: 'old-operation' } })
  render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
  await userEvent.click(await screen.findByRole('button', { name: '結果を確認' }))
  await waitFor(() => expect(sessionStorage.getItem('payment-operation:202609')).toBeNull())
  expect(sessionStorage.getItem('payment-operation:A:202609')).toBeNull()
  expect(actions.recordPayment).not.toHaveBeenCalled()
})

it('壊れた旧キーがあっても現在の世帯の未確認操作を復元する', async () => {
  sessionStorage.setItem('payment-operation:202609', '{broken')
  sessionStorage.setItem('payment-operation:A:202609', JSON.stringify({ kind: 'record', input: { month: '202609', operationId: 'current-operation' } }))
  actions.getPaymentOperation.mockResolvedValue({ success: true, data: null })
  render(<PaymentStatusPanel householdId="A" month="202609" initialResult={{ success: true, data: status }} />)
  await userEvent.click(await screen.findByRole('button', { name: '結果を確認' }))
  expect(actions.getPaymentOperation).toHaveBeenCalledWith('202609', 'current-operation')
  expect(screen.getByRole('button', { name: '振込済みにする' })).toBeDisabled()
})
