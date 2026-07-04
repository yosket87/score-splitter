import { describe, it, expect } from 'vitest'
import {
  calculateSettlement,
  filterActualExpenses,
  filterCarryoverExpenses,
  filterClearedCarryovers,
  getSettlementDirectionLabel,
} from '@/lib/utils/calculation'
import type { Income, Expense, Carryover } from '@/types'

describe('calculateSettlement', () => {
  // 仕様書のサンプルデータ
  const sampleIncomes: Income[] = [
    { id: '1', month: '202601', label: '夫手取り＋子育てT', amount: 984590, person: 'husband' },
    { id: '2', month: '202601', label: '妻手取り', amount: 52448, person: 'wife' },
  ]

  const sampleExpenses: Expense[] = [
    { id: '1', month: '202601', label: '家賃', amount: -146450, person: 'husband', isCarryover: false },
    { id: '2', month: '202601', label: '駐車場', amount: -13400, person: 'husband', isCarryover: false },
    { id: '3', month: '202601', label: '電気代', amount: -19470, person: 'husband', isCarryover: false },
    { id: '4', month: '202601', label: '食費', amount: -63028, person: 'wife', isCarryover: false },
    { id: '5', month: '202601', label: '備品費', amount: -101196, person: 'wife', isCarryover: false },
    { id: '6', month: '202601', label: '出前＋外食', amount: -60556, person: 'wife', isCarryover: false },
    { id: '7', month: '202601', label: 'タブレット＋Youtube', amount: -4460, person: 'husband', isCarryover: false },
    { id: '8', month: '202601', label: '子供用品', amount: -55442, person: 'wife', isCarryover: false },
    { id: '9', month: '202601', label: '保育園代＋備品', amount: -5500, person: 'husband', isCarryover: false },
    { id: '10', month: '202601', label: 'ガソリン＋高速', amount: -16600, person: 'husband', isCarryover: false },
    { id: '11', month: '202601', label: 'スイミング', amount: -10505, person: 'wife', isCarryover: false },
    { id: '12', month: '202601', label: '婦人科', amount: -10450, person: 'wife', isCarryover: false },
    { id: '13', month: '202601', label: '社会保険＋年金', amount: -43000, person: 'husband', isCarryover: false },
    { id: '14', month: '202601', label: '小規模企業共済', amount: -70000, person: 'husband', isCarryover: false },
    { id: '15', month: '202601', label: '水道代', amount: -9838, person: 'husband', isCarryover: false },
    { id: '16', month: '202601', label: 'ネット代', amount: -4807, person: 'husband', isCarryover: false },
    { id: '17', month: '202601', label: 'ガス代', amount: -9076, person: 'husband', isCarryover: false },
    { id: '18', month: '202601', label: '庸介所得税(2023)', amount: -190000, person: 'husband', isCarryover: false },
  ]

  it('収入合計を正しく計算する', () => {
    const result = calculateSettlement(sampleIncomes, sampleExpenses)
    expect(result.totalIncome).toBe(1037038) // 984590 + 52448
  })

  it('支出合計を正しく計算する', () => {
    const result = calculateSettlement(sampleIncomes, sampleExpenses)
    expect(result.totalExpense).toBe(-833778)
  })

  it('担当者別の収入を正しく計算する', () => {
    const result = calculateSettlement(sampleIncomes, sampleExpenses)
    expect(result.husbandIncome).toBe(984590)
    expect(result.wifeIncome).toBe(52448)
  })

  it('担当者別の支出を正しく計算する', () => {
    const result = calculateSettlement(sampleIncomes, sampleExpenses)
    expect(result.husbandExpense).toBe(-532601)
    expect(result.wifeExpense).toBe(-301177)
  })

  it('担当者別の合計を正しく計算する', () => {
    const result = calculateSettlement(sampleIncomes, sampleExpenses)
    expect(result.husbandTotal).toBe(451989) // 984590 + (-532601)
    expect(result.wifeTotal).toBe(-248729) // 52448 + (-301177)
  })

  it('お小遣いを正しく計算する', () => {
    const result = calculateSettlement(sampleIncomes, sampleExpenses)
    expect(result.allowance).toBe(101630) // (1037038 + (-833778)) / 2
  })

  it('精算額を正しく計算する（夫→妻）', () => {
    const result = calculateSettlement(sampleIncomes, sampleExpenses)
    expect(result.settlement).toBe(350359) // 451989 - 101630
  })

  it('空の配列を渡すと全て0を返す', () => {
    const result = calculateSettlement([], [])
    expect(result.totalIncome).toBe(0)
    expect(result.totalExpense).toBe(0)
    expect(result.allowance).toBe(0)
    expect(result.settlement).toBe(0)
  })

  it('収入のみの場合、支出は0で計算する', () => {
    const incomes: Income[] = [
      { id: '1', month: '202601', label: '給料', amount: 100000, person: 'husband' },
    ]
    const result = calculateSettlement(incomes, [])
    expect(result.totalIncome).toBe(100000)
    expect(result.totalExpense).toBe(0)
    expect(result.allowance).toBe(50000) // 100000 / 2
    expect(result.settlement).toBe(50000) // 100000 - 50000
  })

  it('妻の方が支出が多い場合、精算額が負になる', () => {
    const incomes: Income[] = [
      { id: '1', month: '202601', label: '給料', amount: 100000, person: 'wife' },
    ]
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '支出', amount: -80000, person: 'wife', isCarryover: false },
    ]
    const result = calculateSettlement(incomes, expenses)
    expect(result.allowance).toBe(10000) // (100000 - 80000) / 2
    expect(result.wifeTotal).toBe(20000) // 100000 - 80000
    expect(result.husbandTotal).toBe(0)
    expect(result.settlement).toBe(-10000) // 0 - 10000 (妻→夫)
  })

  it('isCarryover=trueの支出は精算から除外される', () => {
    const incomes: Income[] = [
      { id: '1', month: '202601', label: '給料', amount: 200000, person: 'husband' },
    ]
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '通常支出', amount: -50000, person: 'husband', isCarryover: false },
      { id: '2', month: '202601', label: '繰越扱い支出', amount: -30000, person: 'husband', isCarryover: true },
    ]
    const result = calculateSettlement(incomes, expenses)
    // 繰越扱い支出(-30000)は除外されるので、支出合計は-50000のみ
    expect(result.totalExpense).toBe(-50000)
    expect(result.husbandExpense).toBe(-50000)
    expect(result.allowance).toBe(75000) // (200000 - 50000) / 2
  })

  it('isCleared=trueの繰越は精算に含まれる', () => {
    const incomes: Income[] = [
      { id: '1', month: '202601', label: '給料', amount: 200000, person: 'husband' },
    ]
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '通常支出', amount: -50000, person: 'husband', isCarryover: false },
    ]
    const carryovers: Carryover[] = [
      { id: '1', month: '202601', label: '前月繰越', amount: -20000, person: 'wife', isCleared: true },
      { id: '2', month: '202601', label: '未清算繰越', amount: -10000, person: 'wife', isCleared: false },
    ]
    const result = calculateSettlement(incomes, expenses, carryovers)
    // 清算済み繰越(-20000)は精算に含まれ、未清算(-10000)は除外
    expect(result.totalExpense).toBe(-70000) // -50000 + -20000
    expect(result.husbandExpense).toBe(-50000)
    expect(result.wifeExpense).toBe(-20000)
    expect(result.allowance).toBe(65000) // (200000 - 70000) / 2
  })

  it('繰越支出と清算済み繰越の複合シナリオ', () => {
    const incomes: Income[] = [
      { id: '1', month: '202601', label: '夫給料', amount: 300000, person: 'husband' },
      { id: '2', month: '202601', label: '妻給料', amount: 100000, person: 'wife' },
    ]
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '家賃', amount: -100000, person: 'husband', isCarryover: false },
      { id: '2', month: '202601', label: '食費', amount: -40000, person: 'wife', isCarryover: false },
      { id: '3', month: '202601', label: '家電（繰越扱い）', amount: -60000, person: 'husband', isCarryover: true },
    ]
    const carryovers: Carryover[] = [
      { id: '1', month: '202601', label: '先月の家電', amount: -30000, person: 'husband', isCleared: true },
      { id: '2', month: '202601', label: '未清算の繰越', amount: -15000, person: 'wife', isCleared: false },
    ]
    const result = calculateSettlement(incomes, expenses, carryovers)
    // 精算対象: 家賃(-100000) + 食費(-40000) + 清算済み繰越(-30000) = -170000
    // 繰越扱い支出(-60000)と未清算繰越(-15000)は除外
    expect(result.totalExpense).toBe(-170000)
    expect(result.husbandExpense).toBe(-130000) // -100000 + -30000
    expect(result.wifeExpense).toBe(-40000)
    expect(result.totalIncome).toBe(400000)
    expect(result.allowance).toBe(115000) // (400000 - 170000) / 2
    expect(result.husbandTotal).toBe(170000) // 300000 - 130000
    expect(result.settlement).toBe(55000) // 170000 - 115000
  })
})

describe('filterActualExpenses', () => {
  it('isCarryover=falseの支出のみ返す', () => {
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '通常', amount: -10000, person: 'husband', isCarryover: false },
      { id: '2', month: '202601', label: '繰越', amount: -20000, person: 'wife', isCarryover: true },
      { id: '3', month: '202601', label: '通常2', amount: -30000, person: 'wife', isCarryover: false },
    ]
    const result = filterActualExpenses(expenses)
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.id)).toEqual(['1', '3'])
  })

  it('空配列を返す（全て繰越扱い）', () => {
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '繰越', amount: -10000, person: 'husband', isCarryover: true },
    ]
    expect(filterActualExpenses(expenses)).toHaveLength(0)
  })

  it('空配列に対して空配列を返す', () => {
    expect(filterActualExpenses([])).toEqual([])
  })
})

describe('filterCarryoverExpenses', () => {
  it('isCarryover=trueの支出のみ返す', () => {
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '通常', amount: -10000, person: 'husband', isCarryover: false },
      { id: '2', month: '202601', label: '繰越', amount: -20000, person: 'wife', isCarryover: true },
      { id: '3', month: '202601', label: '繰越2', amount: -30000, person: 'husband', isCarryover: true },
    ]
    const result = filterCarryoverExpenses(expenses)
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.id)).toEqual(['2', '3'])
  })

  it('空配列を返す（全て通常支出）', () => {
    const expenses: Expense[] = [
      { id: '1', month: '202601', label: '通常', amount: -10000, person: 'husband', isCarryover: false },
    ]
    expect(filterCarryoverExpenses(expenses)).toHaveLength(0)
  })
})

describe('filterClearedCarryovers', () => {
  it('isCleared=trueの繰越のみ返す', () => {
    const carryovers: Carryover[] = [
      { id: '1', month: '202601', label: '清算済み', amount: -10000, person: 'husband', isCleared: true },
      { id: '2', month: '202601', label: '未清算', amount: -20000, person: 'wife', isCleared: false },
      { id: '3', month: '202601', label: '清算済み2', amount: -30000, person: 'wife', isCleared: true },
    ]
    const result = filterClearedCarryovers(carryovers)
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.id)).toEqual(['1', '3'])
  })

  it('空配列を返す（全て未清算）', () => {
    const carryovers: Carryover[] = [
      { id: '1', month: '202601', label: '未清算', amount: -10000, person: 'husband', isCleared: false },
    ]
    expect(filterClearedCarryovers(carryovers)).toHaveLength(0)
  })

  it('空配列に対して空配列を返す', () => {
    expect(filterClearedCarryovers([])).toEqual([])
  })
})

describe('getSettlementDirectionLabel', () => {
  it('正の精算額は夫から妻への方向を返す', () => {
    expect(getSettlementDirectionLabel(1)).toBe('夫 → 妻')
  })

  it('負の精算額は妻から夫への方向を返す', () => {
    expect(getSettlementDirectionLabel(-1)).toBe('妻 → 夫')
  })

  it('0の精算額は夫から妻への方向を返す', () => {
    expect(getSettlementDirectionLabel(0)).toBe('夫 → 妻')
  })
})
