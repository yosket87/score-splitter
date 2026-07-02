'use server'

import { revalidatePath } from 'next/cache'
import {
  createCarryover as createCarryoverRecord,
  deleteCarryover as deleteCarryoverRecord,
  getCarryoversByMonth as getCarryoverRecordsByMonth,
  toggleCarryoverCleared as toggleCarryoverClearedRecord,
  updateCarryover as updateCarryoverRecord,
} from '@/lib/api/records'
import { carryoverSchema } from '@/lib/validations/carryover'
import type { Carryover, ActionResult } from '@/types'

export async function getCarryoversByMonth(month: string): Promise<ActionResult<Carryover[]>> {
  try {
    const data = await getCarryoverRecordsByMonth(month)
    return { success: true, data }
  } catch (error) {
    console.error('繰越取得エラー:', error)
    return { success: false, error: '繰越データの取得に失敗しました' }
  }
}

export async function createCarryover(
  formData: FormData
): Promise<ActionResult<Carryover>> {
  const rawData = {
    month: formData.get('month') as string,
    label: formData.get('label') as string,
    amount: Number(formData.get('amount')),
    person: formData.get('person') as string,
    is_cleared: formData.get('is_cleared') === 'true',
  }

  const parsed = carryoverSchema.safeParse(rawData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    // 入力は正の値、保存時に負の値に変換
    const data = await createCarryoverRecord({
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCleared: parsed.data.is_cleared,
    })
    revalidatePath('/')
    return { success: true, data }
  } catch (error) {
    console.error('繰越作成エラー:', error)
    return { success: false, error: '繰越の作成に失敗しました' }
  }
}

export async function updateCarryover(
  id: string,
  formData: FormData
): Promise<ActionResult<Carryover>> {
  const rawData = {
    month: formData.get('month') as string,
    label: formData.get('label') as string,
    amount: Number(formData.get('amount')),
    person: formData.get('person') as string,
    is_cleared: formData.get('is_cleared') === 'true',
  }

  const parsed = carryoverSchema.safeParse(rawData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    // 入力は正の値、保存時に負の値に変換
    const data = await updateCarryoverRecord(id, {
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCleared: parsed.data.is_cleared,
    })
    revalidatePath('/')
    return { success: true, data }
  } catch (error) {
    console.error('繰越更新エラー:', error)
    return { success: false, error: '繰越の更新に失敗しました' }
  }
}

export async function toggleCarryoverCleared(
  id: string,
  isCleared: boolean
): Promise<ActionResult> {
  try {
    await toggleCarryoverClearedRecord(id, isCleared)
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('繰越清算フラグ更新エラー:', error)
    return { success: false, error: '清算フラグの更新に失敗しました' }
  }
}

export async function deleteCarryover(id: string): Promise<ActionResult> {
  try {
    await deleteCarryoverRecord(id)
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('繰越削除エラー:', error)
    return { success: false, error: '繰越の削除に失敗しました' }
  }
}
