import { describe, expect, it } from 'vitest'
import { simulateSettlement } from '@/features/waitlist-lp/utils'

describe('simulateSettlement', () => {
  it('収入差があるときパートナーからあなたへの精算額を計算する', () => {
    // あなた30万・パートナー20万・経費18万 → 残り32万を山分けで各16万
    // あなたは 30万-18万=12万 しか残っていないので、パートナーから4万受け取る
    const result = simulateSettlement({
      myIncome: 300000,
      partnerIncome: 200000,
      sharedExpense: 180000,
    })

    expect(result.allowance).toBe(160000)
    expect(result.amount).toBe(40000)
    expect(result.payer).toBe('partner')
  })

  it('あなたの手残りが取り分を超えるときはあなたが支払う', () => {
    // あなた30万・パートナー10万・経費4万 → 各18万。あなたの手残り26万 → 8万支払う
    const result = simulateSettlement({
      myIncome: 300000,
      partnerIncome: 100000,
      sharedExpense: 40000,
    })

    expect(result.allowance).toBe(180000)
    expect(result.amount).toBe(80000)
    expect(result.payer).toBe('me')
  })

  it('全て0のときは精算なし', () => {
    const result = simulateSettlement({
      myIncome: 0,
      partnerIncome: 0,
      sharedExpense: 0,
    })

    expect(result.allowance).toBe(0)
    expect(result.amount).toBe(0)
  })
})
