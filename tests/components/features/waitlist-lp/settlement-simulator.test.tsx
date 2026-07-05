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

  it('負の値を入力するとバリデーションメッセージを表示し計算は0として扱う', async () => {
    const user = userEvent.setup()
    renderSimulator()

    await user.type(screen.getByLabelText('あなたの月収'), '-5')

    expect(
      screen.getByText('0以上の数値を入力してください')
    ).toBeInTheDocument()
    // 取り分・精算額とも ¥0 のまま（負値が計算に反映されない）
    expect(screen.getAllByText('¥0')).toHaveLength(2)
  })

  it('有効な値に戻すとメッセージが消える', async () => {
    const user = userEvent.setup()
    renderSimulator()

    const incomeInput = screen.getByLabelText('あなたの月収')
    await user.type(incomeInput, '-5')
    expect(
      screen.getByText('0以上の数値を入力してください')
    ).toBeInTheDocument()

    await user.clear(incomeInput)
    await user.type(incomeInput, '100')

    expect(
      screen.queryByText('0以上の数値を入力してください')
    ).not.toBeInTheDocument()
  })
})
