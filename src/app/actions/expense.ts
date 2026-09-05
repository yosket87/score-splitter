'use server'

import {
  createExpense as createExpenseRecord,
  deleteExpense as deleteExpenseRecord,
  getExpensesByMonth as getExpenseRecordsByMonth,
  toggleExpenseCarryover as toggleExpenseCarryoverRecord,
  updateExpense as updateExpenseRecord,
} from '@/lib/api/records'
import { readEntryFormData, runEntryMutation, runEntryQuery } from './entry-helpers'
import { expenseSchema } from '@/lib/validations/expense'
import { requireHouseholdContext } from '@/lib/household-context'
import type { Expense, ActionResult } from '@/types'

export async function getExpensesByMonth(month: string): Promise<ActionResult<Expense[]>> {
  const context = await requireHouseholdContext()

  return runEntryQuery(
    { log: '支出取得エラー:', error: '支出データの取得に失敗しました' },
    () => getExpenseRecordsByMonth(context, month)
  )
}

export async function createExpense(
  formData: FormData
): Promise<ActionResult<Expense>> {
  const context = await requireHouseholdContext()

  const parsed = expenseSchema.safeParse({
    ...readEntryFormData(formData),
    is_carryover: formData.get('is_carryover') === 'true',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  // 入力は正の値、保存時に負の値に変換
  return runEntryMutation(
    { log: '支出作成エラー:', error: '支出の作成に失敗しました' },
    parsed.data.month,
    () => createExpenseRecord(context, {
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCarryover: parsed.data.is_carryover,
    })
  )
}

export async function updateExpense(
  id: string,
  formData: FormData
): Promise<ActionResult<Expense>> {
  const context = await requireHouseholdContext()

  const parsed = expenseSchema.safeParse({
    ...readEntryFormData(formData),
    is_carryover: formData.get('is_carryover') === 'true',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  // 入力は正の値、保存時に負の値に変換
  return runEntryMutation(
    { log: '支出更新エラー:', error: '支出の更新に失敗しました' },
    parsed.data.month,
    () => updateExpenseRecord(context, id, {
      month: parsed.data.month,
      label: parsed.data.label,
      amount: -parsed.data.amount,
      person: parsed.data.person,
      isCarryover: parsed.data.is_carryover,
    })
  )
}

export async function toggleExpenseCarryover(
  id: string,
  isCarryover: boolean,
  month?: string
): Promise<ActionResult> {
  const context = await requireHouseholdContext()

  return runEntryMutation(
    { log: '支出繰越フラグ更新エラー:', error: '繰越フラグの更新に失敗しました' },
    month,
    () => toggleExpenseCarryoverRecord(context, id, isCarryover)
  )
}

export async function deleteExpense(id: string, month?: string): Promise<ActionResult> {
  const context = await requireHouseholdContext()

  return runEntryMutation(
    { log: '支出削除エラー:', error: '支出の削除に失敗しました' },
    month,
    () => deleteExpenseRecord(context, id)
  )
}
