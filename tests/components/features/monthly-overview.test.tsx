import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthlyOverview } from '@/features/monthly-overview'
import type { MonthlyOverviewSummary } from '@/features/monthly-overview'
import type { Expense, Income, MonthlySummary } from '@/types'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('@/features/copy-month', () => ({
  CopyMonthDialog: () => <button type="button">前月からコピー</button>,
}))

vi.mock('@/features/export-csv', () => ({
  ExportCsvButton: () => <button type="button">CSV出力</button>,
}))

vi.mock('@/features/ai-diagnosis', () => ({
  AiDiagnosisDialog: ({
    month,
    hasActualExpenses,
  }: {
    month: string
    hasActualExpenses: boolean
  }) => (
    <button
      type="button"
      data-month={month}
      data-has-actual-expenses={String(hasActualExpenses)}
    >
      AIで今月を振り返る
    </button>
  ),
}))

const incomes: Income[] = [
  {
    id: 'income-1',
    month: '202604',
    label: '夫手取り',
    amount: 100000,
    person: 'husband',
  },
  {
    id: 'income-2',
    month: '202604',
    label: '妻手取り',
    amount: 500000,
    person: 'wife',
  },
]

const expenses: Expense[] = [
  {
    id: 'expense-1',
    month: '202604',
    label: '家賃',
    amount: -100000,
    person: 'husband',
    isCarryover: false,
  },
]

const summaries: MonthlySummary[] = [
  {
    month: '202603',
    incomeTotal: 580000,
    expenseTotal: -180000,
    balance: 400000,
  },
  {
    month: '202604',
    incomeTotal: 600000,
    expenseTotal: -100000,
    balance: 500000,
  },
]

function renderOverview(
  overviewSummary: MonthlyOverviewSummary = {
    incomes,
    expenses,
    carryovers: [],
  }
) {
  return render(
    <MonthlyOverview
      year={2026}
      month={4}
      summary={overviewSummary}
      summaries={summaries}
    />
  )
}

describe('MonthlyOverview', () => {
  it('精算額と月収支の間に内訳を配置し、空配列は精算不要にする', async () => {
    const user = userEvent.setup()
    renderOverview({ incomes: [], expenses: [], carryovers: [] })
    const trigger = screen.getByRole('button', { name: '精算の内訳' })
    expect(screen.getByRole('heading', { level: 1 }).compareDocumentPosition(trigger)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(trigger.compareDocumentPosition(screen.getByText('月収支'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    await user.click(trigger)
    expect(screen.getByText('精算不要')).toBeVisible()
  })

  it.each([false, true])('清算対象繰越のみを内訳に含める（清算: %s）', async (isCleared) => {
    const user = userEvent.setup()
    renderOverview({
      incomes,
      expenses: [...expenses, { ...expenses[0], id: 'excluded', amount: -99999, isCarryover: true }],
      carryovers: [{ id: 'carryover', month: '202604', label: '繰越', amount: -10000, person: 'husband', isCleared }],
    })
    await user.click(screen.getByRole('button', { name: '精算の内訳' }))
    const husband = within(screen.getByRole('region', { name: '夫の内訳' }))
    expect(husband.getAllByRole('definition').map((node) => node.textContent)).toEqual(
      isCleared ? ['¥100,000', '−¥110,000', '−¥10,000'] : ['¥100,000', '−¥100,000', '¥0']
    )
    expect(screen.getByRole('region', { name: '月収支' })).toHaveTextContent('支出 ¥199,999')
    expect(Boolean(screen.queryByText(/今月清算する繰越/))).toBe(isCleared)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      isCleared ? '精算額 ¥255,000 妻 → 夫' : '精算額 ¥250,000 妻 → 夫'
    )
  })

  it('内訳は0.5円を表示し、上部の精算額は既存の整数表示を保つ', async () => {
    const user = userEvent.setup()
    renderOverview({ incomes: [{ ...incomes[0], amount: 101 }], expenses: [], carryovers: [] })
    await user.click(screen.getByRole('button', { name: '精算の内訳' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('精算額 ¥50 夫 → 妻')
    expect(screen.getAllByText('¥50.5')).toHaveLength(2)
  })

  it('structured propsを受け取るMonthlyOverviewを公開する', () => {
    expect(MonthlyOverview).toBeTypeOf('function')
  })

  it('精算額と方向を最上位見出しとして表示する', () => {
    renderOverview()

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '精算額 ¥250,000 妻 → 夫',
      })
    ).toBeInTheDocument()
  })

  it('月次要約のラベルを日本語で表示する', () => {
    const { container } = renderOverview()

    expect(screen.getByText('精算額')).toBeInTheDocument()
    expect(screen.getByText('月収支')).toBeInTheDocument()
    expect(screen.getByText('お小遣い')).toBeInTheDocument()
    expect(screen.getByText('推移')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(
      /Score Splitter|Balance|Allowance|Settlement|Trend/
    )
  })

  it('精算方向に夫と妻の文字を残す', () => {
    renderOverview()

    expect(screen.getByText('妻 → 夫')).toBeInTheDocument()
  })

  it('月移動ボタンに44px以上のタッチ領域がある', () => {
    renderOverview()

    expect(screen.getByRole('button', { name: '前月に移動' })).toHaveClass(
      'h-11',
      'w-11'
    )
    expect(screen.getByRole('button', { name: '翌月に移動' })).toHaveClass(
      'h-11',
      'w-11'
    )
    expect(screen.getByRole('button', { name: '今月に移動' })).toHaveClass(
      'h-11'
    )
  })

  it('childrenなしで推移を内部構成し、要約順に表示する', () => {
    renderOverview()

    const overview = screen.getByRole('region', { name: '月次要約' })
    const settlement = within(overview).getByText('精算額')
    const balance = within(overview).getByText('月収支')
    const allowance = within(overview).getByText('お小遣い')
    const trend = within(overview).getByRole('img', {
      name: '直近2ヶ月の収入と支出の推移グラフ',
    })

    expect(settlement.compareDocumentPosition(balance)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(balance.compareDocumentPosition(allowance)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(allowance.compareDocumentPosition(trend)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it('コピー・CSVの順を保ってAI診断を同じアクション群へ配置する', () => {
    renderOverview()

    const copy = screen.getByRole('button', { name: '前月からコピー' })
    const csv = screen.getByRole('button', { name: 'CSV出力' })
    const ai = screen.getByRole('button', { name: 'AIで今月を振り返る' })

    expect(copy.compareDocumentPosition(csv)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(csv.compareDocumentPosition(ai)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(ai).toHaveAttribute('data-month', '202604')
    expect(ai).toHaveAttribute('data-has-actual-expenses', 'true')
  })

  it('繰越支出だけの月はAI診断へ実支出なしを渡す', () => {
    renderOverview({
      incomes,
      expenses: [{ ...expenses[0], isCarryover: true }],
      carryovers: [],
    })

    expect(
      screen.getByRole('button', { name: 'AIで今月を振り返る' })
    ).toHaveAttribute('data-has-actual-expenses', 'false')
  })

  it('AIプロバイダーが利用できない場合は診断起点を表示しない', () => {
    render(
      <MonthlyOverview
        year={2026}
        month={4}
        summary={{ incomes, expenses, carryovers: [] }}
        summaries={summaries}
        aiDiagnosisAvailable={false}
      />
    )

    expect(
      screen.queryByRole('button', { name: 'AIで今月を振り返る' })
    ).not.toBeInTheDocument()
  })
})
