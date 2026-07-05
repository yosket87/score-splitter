import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ActionResult } from '@/types'

const joinWaitlistMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: joinWaitlistMock }))

import { WaitlistForm } from '@/features/waitlist-lp/components/waitlist-form'
import { SimulatorUsageProvider } from '@/features/waitlist-lp/components/simulator-usage-provider'

function renderForm() {
  return render(
    <SimulatorUsageProvider>
      <WaitlistForm />
    </SimulatorUsageProvider>
  )
}

describe('WaitlistForm', () => {
  beforeEach(() => {
    joinWaitlistMock.mockReset()
  })

  it('メール・価格意向・honeypotのフィールドを持つ', () => {
    renderForm()

    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.getByLabelText('無料なら使いたい')).toBeInTheDocument()
    expect(screen.getByLabelText('月380円でも使いたい')).toBeInTheDocument()
    expect(screen.getByLabelText('無料なら使いたい')).not.toBeChecked()
    expect(screen.getByLabelText('月380円でも使いたい')).not.toBeChecked()

    const honeypot = document.querySelector('input[name="website"]')
    expect(honeypot).not.toBeNull()
    expect(honeypot).toHaveAttribute('tabindex', '-1')
  })

  it('送信成功で完了メッセージを表示する', async () => {
    const user = userEvent.setup()
    joinWaitlistMock.mockResolvedValueOnce({ success: true } satisfies ActionResult)
    renderForm()

    await user.type(screen.getByLabelText('メールアドレス'), 'couple@example.com')
    await user.click(screen.getByLabelText('月380円でも使いたい'))
    await user.click(screen.getByRole('button', { name: 'ウェイトリストに登録' }))

    expect(
      await screen.findByText('登録ありがとうございます。準備ができたらご連絡します。')
    ).toBeInTheDocument()
  })

  it('エラー時はメッセージを表示しフォームを維持する', async () => {
    const user = userEvent.setup()
    joinWaitlistMock.mockResolvedValueOnce({
      success: false,
      error: '登録に失敗しました。時間をおいて再度お試しください',
    } satisfies ActionResult)
    renderForm()

    await user.type(screen.getByLabelText('メールアドレス'), 'couple@example.com')
    await user.click(screen.getByLabelText('無料なら使いたい'))
    await user.click(screen.getByRole('button', { name: 'ウェイトリストに登録' }))

    expect(
      await screen.findByText('登録に失敗しました。時間をおいて再度お試しください')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
  })
})
