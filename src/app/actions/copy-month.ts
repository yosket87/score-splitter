'use server'

import { revalidatePath } from 'next/cache'
import {
  copyMonthData as copyMonthDataByApi,
  getCopyMonthPreview as getCopyMonthPreviewByApi,
} from '@/lib/api/copy-month'
import type {
  ActionResult,
  CopyMonthOptions,
  CopyMonthPreview,
  CopyMonthResult,
} from '@/types'

/**
 * コピー操作のプレビューを取得
 * 収入・支出の項目リストと繰越件数を返す
 */
export async function getCopyMonthPreview(
  sourceMonth: string,
  targetMonth: string
): Promise<ActionResult<CopyMonthPreview>> {
  try {
    const data = await getCopyMonthPreviewByApi(sourceMonth, targetMonth)
    return { success: true, data }
  } catch (error) {
    console.error('月コピープレビュー取得エラー:', error)
    return { success: false, error: 'プレビューデータの取得に失敗しました' }
  }
}

/**
 * 月データをコピー
 */
export async function copyMonthData(
  options: CopyMonthOptions
): Promise<CopyMonthResult> {
  try {
    const result = await copyMonthDataByApi(options)
    if (result.success) {
      revalidatePath('/')
    }
    return result
  } catch (error) {
    console.error('月データコピーエラー:', error)
    return {
      success: false,
      copied: { incomes: 0, expenses: 0, carryovers: 0 },
      skipped: { incomes: 0, expenses: 0, carryovers: 0 },
      error:
        error instanceof Error ? error.message : 'データのコピーに失敗しました',
    }
  }
}
