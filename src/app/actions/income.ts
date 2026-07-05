'use server'

import {
  createIncome as createIncomeRecord,
  deleteIncome as deleteIncomeRecord,
  getIncomesByMonth as getIncomeRecordsByMonth,
  updateIncome as updateIncomeRecord,
} from '@/lib/api/records'
import { readEntryFormData, runEntryMutation, runEntryQuery } from './entry-helpers'
import { incomeSchema } from '@/lib/validations/income'
import { requireAuth } from '@/lib/webauthn/session'
import type { Income, ActionResult } from '@/types'

export async function getIncomesByMonth(month: string): Promise<ActionResult<Income[]>> {
  await requireAuth()

  return runEntryQuery(
    { log: '収入取得エラー:', error: '収入データの取得に失敗しました' },
    () => getIncomeRecordsByMonth(month)
  )
}

export async function createIncome(
  formData: FormData
): Promise<ActionResult<Income>> {
  await requireAuth()

  const parsed = incomeSchema.safeParse(readEntryFormData(formData))
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  return runEntryMutation(
    { log: '収入作成エラー:', error: '収入の作成に失敗しました' },
    parsed.data.month,
    () => createIncomeRecord({
      month: parsed.data.month,
      label: parsed.data.label,
      amount: parsed.data.amount,
      person: parsed.data.person,
    })
  )
}

export async function updateIncome(
  id: string,
  formData: FormData
): Promise<ActionResult<Income>> {
  await requireAuth()

  const parsed = incomeSchema.safeParse(readEntryFormData(formData))
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  return runEntryMutation(
    { log: '収入更新エラー:', error: '収入の更新に失敗しました' },
    parsed.data.month,
    () => updateIncomeRecord(id, {
      month: parsed.data.month,
      label: parsed.data.label,
      amount: parsed.data.amount,
      person: parsed.data.person,
    })
  )
}

export async function deleteIncome(id: string, month?: string): Promise<ActionResult> {
  await requireAuth()

  return runEntryMutation(
    { log: '収入削除エラー:', error: '収入の削除に失敗しました' },
    month,
    () => deleteIncomeRecord(id)
  )
}
