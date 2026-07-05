import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import type { ActionResult } from '@/types'

const joinWaitlistMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: joinWaitlistMock }))

import { WaitlistForm } from '@/features/waitlist-lp/components/waitlist-form'
import { SimulatorUsageProvider } from '@/features/waitlist-lp/components/simulator-usage-provider'

function renderForm(props?: ComponentProps<typeof WaitlistForm>) {
  return render(
    <SimulatorUsageProvider>
      <WaitlistForm {...props} />
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

  it('idPrefixでフォーム内のidを一意にできる', () => {
    render(
      <SimulatorUsageProvider>
        <WaitlistForm idPrefix="hero-waitlist" variant="compact" />
        <WaitlistForm idPrefix="signup-waitlist" />
      </SimulatorUsageProvider>
    )

    expect(document.getElementById('hero-waitlist-email')).toHaveAccessibleName(
      'メールアドレス'
    )
    expect(document.getElementById('signup-waitlist-email')).toHaveAccessibleName(
      'メールアドレス'
    )
    expect(document.getElementById('hero-waitlist-price-free-only')).not.toBeNull()
    expect(document.getElementById('signup-waitlist-price-free-only')).not.toBeNull()
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

  it('compactフォームでも送信成功で完了メッセージを表示する', async () => {
    const user = userEvent.setup()
    joinWaitlistMock.mockResolvedValueOnce({ success: true } satisfies ActionResult)
    renderForm({ idPrefix: 'hero-waitlist', variant: 'compact' })

    await user.type(screen.getByLabelText('メールアドレス'), 'hero@example.com')
    await user.click(screen.getByLabelText('無料なら使いたい'))
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
