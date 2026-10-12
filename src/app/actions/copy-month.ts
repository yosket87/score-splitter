'use server'

import {
  copyMonthData as copyMonthDataByApi,
  getCopyMonthPreview as getCopyMonthPreviewByApi,
} from '@/lib/api/copy-month'
import { revalidateHouseholdData } from './revalidation'
import { requireHouseholdContext } from '@/lib/household-context'
import { copyMonthOptionsSchema, copyMonthPreviewInputSchema } from '@/lib/validations/copy-month'
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
  const context = await requireHouseholdContext()
  const parsed = copyMonthPreviewInputSchema.safeParse({ sourceMonth, targetMonth })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const data = await getCopyMonthPreviewByApi(context, parsed.data.sourceMonth, parsed.data.targetMonth)
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
): Promise<ActionResult<CopyMonthResult>> {
  const context = await requireHouseholdContext()
  const parsed = copyMonthOptionsSchema.safeParse(options)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const result = await copyMonthDataByApi(context, parsed.data)
    if (!result.success) {
      return {
        success: false,
        error: result.error ?? 'データのコピーに失敗しました',
      }
    }

    revalidateHouseholdData(parsed.data.targetMonth)
    return { success: true, data: result }
  } catch (error) {
    console.error('月データコピーエラー:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'データのコピーに失敗しました',
    }
  }
}
