'use server'

import { getMonthlyAmounts } from '@/lib/api/monthly-summary'
import { aggregateMonthlySummaries } from '@/lib/utils/monthly-summary'
import { requireHouseholdContext } from '@/lib/household-context'
import type { ActionResult, MonthlySummary } from '@/types'

export async function getMonthlySummaries(): Promise<
  ActionResult<MonthlySummary[]>
> {
  const context = await requireHouseholdContext()

  try {
    const { incomes, expenses } = await getMonthlyAmounts(context)
    return {
      success: true,
      data: aggregateMonthlySummaries(incomes, expenses),
    }
  } catch (error) {
    console.error('月別サマリー取得エラー:', error)
    return { success: false, error: '月別サマリーの取得に失敗しました' }
  }
}
