import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettlementBreakdown } from '@/features/monthly-overview/components/settlement-breakdown'
import type { CalculationResult } from '@/types'

const normalResult: CalculationResult = {
  totalIncome: 680000,
  totalExpense: -205000,
  husbandIncome: 400000,
  wifeIncome: 280000,
  husbandExpense: -147000,
  wifeExpense: -58000,
  husbandTotal: 253000,
  wifeTotal: 222000,
  allowance: 237500,
  settlement: 15500,
}

const zeroResult: CalculationResult = {
  totalIncome: 0,
  totalExpense: 0,
  husbandIncome: 0,
  wifeIncome: 0,
  husbandExpense: 0,
  wifeExpense: 0,
  husbandTotal: 0,
  wifeTotal: 0,
  allowance: 0,
  settlement: 0,
}

async function openBreakdown(result = normalResult, hasClearedCarryovers = false) {
  const user = userEvent.setup()
  render(<SettlementBreakdown result={result} hasClearedCarryovers={hasClearedCarryovers} />)
  await user.click(screen.getByRole('button', { name: '精算の内訳' }))
  return user
}

describe('SettlementBreakdown', () => {
  it('初期状態は閉じ、クリック・Enter・Spaceで開閉できる', async () => {
    const user = userEvent.setup()
    render(<SettlementBreakdown result={normalResult} hasClearedCarryovers={false} />)
    const trigger = screen.getByRole('button', { name: '精算の内訳' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: '夫の内訳' })).not.toBeInTheDocument()
    await user.tab()
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toBeVisible()
    await user.keyboard(' ')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('夫婦の収入・支出・差引と夫から妻への精算を表示する', async () => {
    await openBreakdown()
    const husband = within(screen.getByRole('region', { name: '夫の内訳' }))
    const wife = within(screen.getByRole('region', { name: '妻の内訳' }))
    expect(husband.getAllByRole('term').map((node) => node.textContent)).toEqual(['収入', '精算対象の支出', '差引'])
    expect(husband.getAllByRole('definition').map((node) => node.textContent)).toEqual(['¥400,000', '−¥147,000', '¥253,000'])
    expect(wife.getAllByRole('definition').map((node) => node.textContent)).toEqual(['¥280,000', '−¥58,000', '¥222,000'])
    expect(screen.getByText('1人あたりのお小遣い')).toBeVisible()
    expect(screen.getByText('¥237,500')).toBeVisible()
    expect(screen.getByText('¥15,500')).toBeVisible()
    expect(screen.getByText('夫 → 妻')).toBeVisible()
    expect(screen.queryByText(/今月清算する繰越/)).not.toBeInTheDocument()
    expect(screen.queryByText(/計算上の金額です/)).not.toBeInTheDocument()
  })

  it('妻から夫への精算は金額を絶対値で表示する', async () => {
    await openBreakdown({
      ...normalResult,
      husbandIncome: 280000, wifeIncome: 400000,
      husbandExpense: -58000, wifeExpense: -147000,
      husbandTotal: 222000, wifeTotal: 253000, settlement: -15500,
    })
    expect(screen.getByText('妻 → 夫')).toBeVisible()
    expect(screen.getByText('¥15,500')).toBeVisible()
  })

  it('全額0円の場合は精算不要と表示し、方向を付けない', async () => {
    await openBreakdown(zeroResult)
    expect(screen.getByText('精算不要')).toBeVisible()
    expect(screen.queryByText(/夫 → 妻|妻 → 夫/)).not.toBeInTheDocument()
    expect(screen.getAllByText('¥0')).toHaveLength(7)
  })

  it('赤字月は差引とお小遣いの負数を保つ', async () => {
    await openBreakdown({
      ...zeroResult, totalExpense: -300,
      husbandExpense: -200, wifeExpense: -100,
      husbandTotal: -200, wifeTotal: -100, allowance: -150, settlement: -50,
    })
    expect(screen.getByText('−¥150')).toBeVisible()
    expect(screen.getByText('¥50')).toBeVisible()
    expect(screen.getByText('妻 → 夫')).toBeVisible()
    expect(screen.queryByText(/お金が残る/)).not.toBeInTheDocument()
  })

  it('清算対象繰越がある場合だけ説明を表示する', async () => {
    await openBreakdown(normalResult, true)
    expect(screen.getByText('精算対象の支出には、今月清算する繰越を含みます')).toBeVisible()
  })

  it.each([101, -101])('差引が%i円の端数を符号付きで表示する', async (amount) => {
    await openBreakdown({
      ...zeroResult,
      totalIncome: amount > 0 ? amount : 0,
      totalExpense: amount < 0 ? amount : 0,
      husbandIncome: amount > 0 ? amount : 0,
      husbandExpense: amount < 0 ? amount : 0,
      husbandTotal: amount, allowance: amount / 2, settlement: amount / 2,
    })
    const allowance = screen.getByText('1人あたりのお小遣い').parentElement!
    expect(within(allowance).getByRole('definition')).toHaveTextContent(amount > 0 ? '¥50.5' : '−¥50.5')
    expect(screen.getByText('精算額').parentElement).toHaveTextContent('¥50.5')
    expect(screen.getByText('計算上の金額です。上部の表示は1円未満を切り捨てています')).toBeVisible()
  })
})
