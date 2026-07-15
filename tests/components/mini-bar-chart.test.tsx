import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MiniBarChart } from '@/components/charts/mini-bar-chart'
import { useMotionPrefs } from '@/components/animations/use-motion-prefs'

vi.mock('@/components/animations/use-motion-prefs', () => ({
  useMotionPrefs: vi.fn(),
}))

const summaries = [
  { month: '202603', income: 100, expense: -500, balance: -400 },
  { month: '202601', income: 100, expense: -100, balance: 0 },
  { month: '202602', income: 500, expense: -100, balance: 400 },
]

beforeEach(() => {
  vi.mocked(useMotionPrefs).mockReturnValue({ reduced: false, allowed: true })
})

describe('MiniBarChart', () => {
  it('データがない場合はチャートを表示しない', () => {
    const { container } = render(<MiniBarChart summaries={[]} currentMonth="202602" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('月順に並べ、当月・黒字・赤字を異なる色で表示する', () => {
    const { container } = render(
      <MiniBarChart summaries={summaries} currentMonth="202602" />
    )

    expect(screen.getByRole('img', { name: '過去3ヶ月の収支トレンドチャート' })).toBeInTheDocument()
    expect(screen.getByText('過去3ヶ月のトレンド')).toBeInTheDocument()
    expect(screen.getAllByText(/月$/).map((label) => label.textContent)).toEqual([
      '1月',
      '2月',
      '3月',
    ])

    const bars = container.querySelectorAll('[role="img"] > div')
    expect(bars[0]).toHaveStyle({ backgroundColor: 'var(--chart-bar-muted)' })
    expect(bars[1]).toHaveStyle({ backgroundColor: 'var(--accent)' })
    expect(bars[2]).toHaveStyle({ backgroundColor: 'var(--neon-red-light)' })
  })

  it('モーション低減時も同じデータを表示する', () => {
    vi.mocked(useMotionPrefs).mockReturnValue({ reduced: true, allowed: false })

    render(<MiniBarChart summaries={summaries.slice(0, 1)} currentMonth="202601" />)

    expect(screen.getByRole('img', { name: '過去1ヶ月の収支トレンドチャート' })).toBeInTheDocument()
  })
})
