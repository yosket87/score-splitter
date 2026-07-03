'use server'

import { revalidatePath } from 'next/cache'
import {
  createExpense as createExpenseRecord,
  deleteExpense as deleteExpenseRecord,
  getExpensesByMonth as getExpenseRecordsByMonth,
  toggleExpenseCarryover as toggleExpenseCarryoverRecord,
  updateExpense as updateExpenseRecord,
} from '@/lib/api/records'
import { expenseSchema } from '@/lib/validations/expense'
import { requireAuth } from '@/lib/webauthn/session'
import type { Expense, ActionResult } from '@/types'

export async function getExpensesByMonth(month: string): Promise<ActionResult<Expense[]>> {
  await requireAuth()

  try {
    const data = await getExpenseRecordsByMonth(month)
    return { success: true, data }
  } catch (error) {
    console.error('支出取得エラー:', error)
    return { success: false, error: '支出データの取得に失敗しました' }
  }
}

export async function createExpense(
  formData: FormData
): Promise<ActionResult<Expense>> {
  await requireAuth()

  const rawData = {
    month: formData.get('month') as string,
    label: formData.get('label') as string,
    amount: Number(formData.get('amount')),
    person: formData.get('person') as string,
    is_carryover: formData.get('is_carryover') === 'true',
  }

  const parsed = expenseSchema.safeParse(rawData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    // 入力は正の値、保存時に負の値に変換
    const data = await createExpenseRecord({
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCarryover: parsed.data.is_carryover,
    })
    revalidatePath('/')
    return { success: true, data }
  } catch (error) {
    console.error('支出作成エラー:', error)
    return { success: false, error: '支出の作成に失敗しました' }
  }
}

export async function updateExpense(
  id: string,
  formData: FormData
): Promise<ActionResult<Expense>> {
  await requireAuth()

  const rawData = {
    month: formData.get('month') as string,
    label: formData.get('label') as string,
    amount: Number(formData.get('amount')),
    person: formData.get('person') as string,
    is_carryover: formData.get('is_carryover') === 'true',
  }

  const parsed = expenseSchema.safeParse(rawData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    // 入力は正の値、保存時に負の値に変換
    const data = await updateExpenseRecord(id, {
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCarryover: parsed.data.is_carryover,
    })
    revalidatePath('/')
    return { success: true, data }
  } catch (error) {
    console.error('支出更新エラー:', error)
    return { success: false, error: '支出の更新に失敗しました' }
  }
}

export async function toggleExpenseCarryover(
  id: string,
  isCarryover: boolean
): Promise<ActionResult> {
  await requireAuth()

  try {
    await toggleExpenseCarryoverRecord(id, isCarryover)
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('支出繰越フラグ更新エラー:', error)
    return { success: false, error: '繰越フラグの更新に失敗しました' }
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  await requireAuth()

  try {
    await deleteExpenseRecord(id)
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('支出削除エラー:', error)
    return { success: false, error: '支出の削除に失敗しました' }
  }
}
