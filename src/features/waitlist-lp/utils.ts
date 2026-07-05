import { calculateSettlement } from '@/lib/utils/calculation'

export interface SimulatorInput {
  myIncome: number
  partnerIncome: number
  sharedExpense: number
}

export interface SimulatorResult {
  /** 山分け後のひとり分の取り分 */
  allowance: number
  /** 精算額（絶対値） */
  amount: number
  /** 精算額を支払う側 */
  payer: 'me' | 'partner'
}

/**
 * LPシミュレーター用の精算計算。
 * 「あなた」をhusband、「パートナー」をwifeに割り当て、
 * 共通経費はあなたが支払った前提で計算する（支出は負値で渡す規約）。
 */
export function simulateSettlement(input: SimulatorInput): SimulatorResult {
  const result = calculateSettlement(
    [
      { id: 'sim-my-income', month: '000000', label: 'あなたの収入', amount: input.myIncome, person: 'husband' },
      { id: 'sim-partner-income', month: '000000', label: 'パートナーの収入', amount: input.partnerIncome, person: 'wife' },
    ],
    [
      {
        id: 'sim-shared-expense',
        month: '000000',
        label: '共通経費',
        amount: -input.sharedExpense,
        person: 'husband',
        isCarryover: false,
      },
    ]
  )

  return {
    allowance: result.allowance,
    amount: Math.abs(result.settlement),
    payer: result.settlement >= 0 ? 'me' : 'partner',
  }
}
