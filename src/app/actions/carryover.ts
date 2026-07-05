'use server'

import {
  createCarryover as createCarryoverRecord,
  deleteCarryover as deleteCarryoverRecord,
  getCarryoversByMonth as getCarryoverRecordsByMonth,
  toggleCarryoverCleared as toggleCarryoverClearedRecord,
  updateCarryover as updateCarryoverRecord,
} from '@/lib/api/records'
import { readEntryFormData, runEntryMutation, runEntryQuery } from './entry-helpers'
import { carryoverSchema } from '@/lib/validations/carryover'
import { requireAuth } from '@/lib/webauthn/session'
import type { Carryover, ActionResult } from '@/types'

export async function getCarryoversByMonth(month: string): Promise<ActionResult<Carryover[]>> {
  await requireAuth()

  return runEntryQuery(
    { log: '繰越取得エラー:', error: '繰越データの取得に失敗しました' },
    () => getCarryoverRecordsByMonth(month)
  )
}

export async function createCarryover(
  formData: FormData
): Promise<ActionResult<Carryover>> {
  await requireAuth()

  const parsed = carryoverSchema.safeParse({
    ...readEntryFormData(formData),
    is_cleared: formData.get('is_cleared') === 'true',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  // 入力は正の値、保存時に負の値に変換
  return runEntryMutation(
    { log: '繰越作成エラー:', error: '繰越の作成に失敗しました' },
    parsed.data.month,
    () => createCarryoverRecord({
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCleared: parsed.data.is_cleared,
    })
  )
}

export async function updateCarryover(
  id: string,
  formData: FormData
): Promise<ActionResult<Carryover>> {
  await requireAuth()

  const parsed = carryoverSchema.safeParse({
    ...readEntryFormData(formData),
    is_cleared: formData.get('is_cleared') === 'true',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  // 入力は正の値、保存時に負の値に変換
  return runEntryMutation(
    { log: '繰越更新エラー:', error: '繰越の更新に失敗しました' },
    parsed.data.month,
    () => updateCarryoverRecord(id, {
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCleared: parsed.data.is_cleared,
    })
  )
}

export async function toggleCarryoverCleared(
  id: string,
  isCleared: boolean,
  month?: string
): Promise<ActionResult> {
  await requireAuth()

  return runEntryMutation(
    { log: '繰越清算フラグ更新エラー:', error: '清算フラグの更新に失敗しました' },
    month,
    () => toggleCarryoverClearedRecord(id, isCleared)
  )
}

export async function deleteCarryover(id: string, month?: string): Promise<ActionResult> {
  await requireAuth()

  return runEntryMutation(
    { log: '繰越削除エラー:', error: '繰越の削除に失敗しました' },
    month,
    () => deleteCarryoverRecord(id)
  )
}
