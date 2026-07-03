'use server'

// 単一世帯前提: household_session Cookie + middleware で認証境界を担保している。
// 将来マルチテナント化する際は世帯IDによるスコープ条件を追加すること。
import { getMonthlyAmounts } from '@/lib/api/monthly-summary'
import { aggregateMonthlySummaries } from '@/lib/utils/monthly-summary'
import { requireAuth } from '@/lib/webauthn/session'
import type { ActionResult, MonthlySummary } from '@/types'

export async function getMonthlySummaries(): Promise<
  ActionResult<MonthlySummary[]>
> {
  await requireAuth()

  try {
    const { incomes, expenses } = await getMonthlyAmounts()
    return {
      success: true,
      data: aggregateMonthlySummaries(incomes, expenses),
    }
  } catch (error) {
    console.error('月別サマリー取得エラー:', error)
    return { success: false, error: '月別サマリーの取得に失敗しました' }
  }
}
