import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettlementSimulator } from '@/features/waitlist-lp/components/settlement-simulator'
import {
  SimulatorUsageProvider,
  useSimulatorUsage,
} from '@/features/waitlist-lp/components/simulator-usage-provider'

function UsageProbe() {
  const { simulatorUsed } = useSimulatorUsage()
  return <output data-testid="usage">{simulatorUsed ? 'used' : 'unused'}</output>
}

function renderSimulator() {
  return render(
    <SimulatorUsageProvider>
      <SettlementSimulator />
      <UsageProbe />
    </SimulatorUsageProvider>
  )
}

describe('SettlementSimulator', () => {
  it('入力に応じて精算額と方向を表示する', async () => {
    const user = userEvent.setup()
    renderSimulator()

    await user.type(screen.getByLabelText('あなたの月収'), '300000')
    await user.type(screen.getByLabelText('パートナーの月収'), '200000')
    await user.type(screen.getByLabelText('共通経費'), '180000')

    expect(screen.getByText('¥160,000')).toBeInTheDocument()
    expect(screen.getByText('¥40,000')).toBeInTheDocument()
    expect(screen.getByText('パートナー → あなた')).toBeInTheDocument()
  })

  it('入力するとシミュレーター利用済みになる', async () => {
    const user = userEvent.setup()
    renderSimulator()

    expect(screen.getByTestId('usage')).toHaveTextContent('unused')
    await user.type(screen.getByLabelText('あなたの月収'), '1')
    expect(screen.getByTestId('usage')).toHaveTextContent('used')
  })

  it('入力値が送信されないことを明記している', () => {
    renderSimulator()
    expect(
      screen.getByText('入力した金額は保存も送信もされません。')
    ).toBeInTheDocument()
  })
})
