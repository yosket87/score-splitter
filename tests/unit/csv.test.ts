import { describe, it, expect } from 'vitest'
import { generateMonthlyCsv } from '@/lib/helpers/csv'
import type { Income, Expense, Carryover } from '@/types'

describe('generateMonthlyCsv', () => {
  const incomes: Income[] = [
    { id: '1', month: '202604', label: '夫手取り', amount: 500000, person: 'husband' },
    { id: '2', month: '202604', label: '妻手取り', amount: 200000, person: 'wife' },
  ]

  const expenses: Expense[] = [
    { id: '1', month: '202604', label: '家賃', amount: -150000, person: 'husband', isCarryover: false },
    { id: '2', month: '202604', label: '食費', amount: -80000, person: 'wife', isCarryover: false },
  ]

  const carryovers: Carryover[] = [
    { id: '1', month: '202604', label: '前月繰越', amount: -5000, person: 'husband', isCleared: false },
  ]

  it('BOMプレフィックスが付与される', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('ヘッダーに月が日本語形式で含まれる', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    expect(csv).toContain('家計データ,2026年4月')
  })

  it('月の実績セクションに正しい計算結果が含まれる', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    expect(csv).toContain('■ 月の実績')
    expect(csv).toContain('収入合計,700000')
    expect(csv).toContain('支出合計（実績）,230000')
  })

  it('精算セクションに正しい計算結果が含まれる', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    expect(csv).toContain('■ 精算')
    expect(csv).toContain('夫の収入,500000')
    expect(csv).toContain('妻の収入,200000')
    expect(csv).toContain('夫の支出,150000')
    expect(csv).toContain('妻の支出,80000')
  })

  it('精算方向が正しく表示される', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    // settlement = husbandTotal - allowance = (500000 - 150000) - (700000 - 230000) / 2 = 350000 - 235000 = 115000
    expect(csv).toContain('精算額,115000')
    expect(csv).toContain('精算方向,夫 → 妻')
  })

  it('支出（実績）セクションの金額が正の値で出力される', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    expect(csv).toContain('■ 支出（実績）')
    const lines = csv.split('\n')

    // 支出セクションの家賃行
    const rentLine = lines.find((l) => l.includes('家賃'))
    expect(rentLine).toBe('夫,家賃,150000')
  })

  it('繰越（未清算）セクションの金額が正の値で出力される', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    expect(csv).toContain('■ 繰越（未清算）')
    const lines = csv.split('\n')

    // 繰越セクションの繰越行
    const carryoverLine = lines.find((l) => l.includes('前月繰越'))
    expect(carryoverLine).toBe('夫,前月繰越,5000')
  })

  it('担当者が日本語で表示される', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    const lines = csv.split('\n')
    const incomeLine = lines.find((l) => l.includes('夫手取り'))
    expect(incomeLine).toBe('夫,夫手取り,500000')
  })

  it('カンマを含むラベルがCSVエスケープされる', () => {
    const incomesWithComma: Income[] = [
      { id: '1', month: '202604', label: '手取り,賞与込み', amount: 500000, person: 'husband' },
    ]
    const csv = generateMonthlyCsv('202604', incomesWithComma, [], [])
    expect(csv).toContain('夫,"手取り,賞与込み",500000')
  })

  it('ダブルクォートを含むラベルがエスケープされる', () => {
    const incomesWithQuote: Income[] = [
      { id: '1', month: '202604', label: '手取り"特別"', amount: 500000, person: 'husband' },
    ]
    const csv = generateMonthlyCsv('202604', incomesWithQuote, [], [])
    expect(csv).toContain('夫,"手取り""特別""",500000')
  })

  it('空データでも有効なCSVが生成される', () => {
    const csv = generateMonthlyCsv('202604', [], [], [])
    expect(csv).toContain('家計データ,2026年4月')
    expect(csv).toContain('収入合計,0')
    expect(csv).toContain('支出合計（実績）,0')
    expect(csv).toContain('精算額,0')
  })

  it('妻→夫の精算方向が正しく表示される', () => {
    const wifeHigherIncomes: Income[] = [
      { id: '1', month: '202604', label: '夫手取り', amount: 100000, person: 'husband' },
      { id: '2', month: '202604', label: '妻手取り', amount: 500000, person: 'wife' },
    ]
    const csv = generateMonthlyCsv('202604', wifeHigherIncomes, [], [])
    expect(csv).toContain('精算方向,妻 → 夫')
  })

  it('繰越扱い支出が支出（繰越扱い）セクションに表示される', () => {
    const expensesWithCarryover: Expense[] = [
      { id: '1', month: '202604', label: '家賃', amount: -150000, person: 'husband', isCarryover: false },
      { id: '2', month: '202604', label: '家電購入', amount: -60000, person: 'wife', isCarryover: true },
    ]
    const csv = generateMonthlyCsv('202604', incomes, expensesWithCarryover, [])
    expect(csv).toContain('■ 支出（繰越扱い）')
    expect(csv).toContain('妻,家電購入,60000')
    // 調整セクションにも表示
    expect(csv).toContain('■ 調整')
    expect(csv).toContain('繰越に回した支出,60000')
  })

  it('繰越扱い支出は支出（実績）セクションに含まれない', () => {
    const expensesWithCarryover: Expense[] = [
      { id: '1', month: '202604', label: '家賃', amount: -150000, person: 'husband', isCarryover: false },
      { id: '2', month: '202604', label: '家電購入', amount: -60000, person: 'wife', isCarryover: true },
    ]
    const csv = generateMonthlyCsv('202604', incomes, expensesWithCarryover, [])
    const lines = csv.split('\n')

    // 支出（実績）セクションの開始と終了を見つける
    const actualExpenseStart = lines.findIndex((l) => l === '■ 支出（実績）')
    const nextSectionAfterActual = lines.findIndex(
      (l, i) => i > actualExpenseStart && l.startsWith('■')
    )
    const actualExpenseSection = lines.slice(actualExpenseStart, nextSectionAfterActual)
    expect(actualExpenseSection.some((l) => l.includes('家電購入'))).toBe(false)
  })

  it('清算済み繰越が繰越（清算済み）セクションに表示される', () => {
    const clearedCarryovers: Carryover[] = [
      { id: '1', month: '202604', label: '前月繰越', amount: -20000, person: 'husband', isCleared: true },
    ]
    const csv = generateMonthlyCsv('202604', incomes, expenses, clearedCarryovers)
    expect(csv).toContain('■ 繰越（清算済み）')
    expect(csv).toContain('夫,前月繰越,20000')
    // 調整セクションにも表示
    expect(csv).toContain('■ 調整')
    expect(csv).toContain('清算した繰越,20000')
  })

  it('未清算繰越のみの場合は調整セクションが表示されない', () => {
    const csv = generateMonthlyCsv('202604', incomes, expenses, carryovers)
    // carryovers has only uncleared, and expenses have no carryover-flagged
    expect(csv).not.toContain('■ 調整')
  })

  it('繰越扱い支出と清算済み繰越の複合シナリオ', () => {
    const mixedExpenses: Expense[] = [
      { id: '1', month: '202604', label: '家賃', amount: -150000, person: 'husband', isCarryover: false },
      { id: '2', month: '202604', label: '食費', amount: -80000, person: 'wife', isCarryover: false },
      { id: '3', month: '202604', label: '大型出費', amount: -50000, person: 'husband', isCarryover: true },
    ]
    const mixedCarryovers: Carryover[] = [
      { id: '1', month: '202604', label: '清算繰越', amount: -30000, person: 'wife', isCleared: true },
      { id: '2', month: '202604', label: '未清算繰越', amount: -10000, person: 'husband', isCleared: false },
    ]
    const csv = generateMonthlyCsv('202604', incomes, mixedExpenses, mixedCarryovers)

    // 全セクションが表示される
    expect(csv).toContain('■ 月の実績')
    expect(csv).toContain('■ 調整')
    expect(csv).toContain('■ 精算')
    expect(csv).toContain('■ 収入')
    expect(csv).toContain('■ 支出（実績）')
    expect(csv).toContain('■ 支出（繰越扱い）')
    expect(csv).toContain('■ 繰越（未清算）')
    expect(csv).toContain('■ 繰越（清算済み）')

    // 精算に含まれるのは実績支出(-230000) + 清算済み繰越(-30000) = -260000
    // 精算額: husbandTotal - allowance = (500000 - 150000) - (700000 - 260000) / 2 = 350000 - 220000 = 130000
    expect(csv).toContain('精算額,130000')
  })
})
