'use server'

import { revalidatePath } from 'next/cache'
import {
  createIncome as createIncomeRecord,
  deleteIncome as deleteIncomeRecord,
  getIncomesByMonth as getIncomeRecordsByMonth,
  updateIncome as updateIncomeRecord,
} from '@/lib/api/records'
import { incomeSchema } from '@/lib/validations/income'
import { requireAuth } from '@/lib/webauthn/session'
import type { Income, ActionResult } from '@/types'

export async function getIncomesByMonth(month: string): Promise<ActionResult<Income[]>> {
  await requireAuth()

  try {
    const data = await getIncomeRecordsByMonth(month)
    return { success: true, data }
  } catch (error) {
    console.error('収入取得エラー:', error)
    return { success: false, error: '収入データの取得に失敗しました' }
  }
}

export async function createIncome(
  formData: FormData
): Promise<ActionResult<Income>> {
  await requireAuth()

  const rawData = {
    month: formData.get('month') as string,
    label: formData.get('label') as string,
    amount: Number(formData.get('amount')),
    person: formData.get('person') as string,
  }

  const parsed = incomeSchema.safeParse(rawData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const data = await createIncomeRecord({
      month: parsed.data.month,
      label: parsed.data.label,
      amount: parsed.data.amount,
      person: parsed.data.person,
    })
    revalidatePath('/')
    return { success: true, data }
  } catch (error) {
    console.error('収入作成エラー:', error)
    return { success: false, error: '収入の作成に失敗しました' }
  }
}

export async function updateIncome(
  id: string,
  formData: FormData
): Promise<ActionResult<Income>> {
  await requireAuth()

  const rawData = {
    month: formData.get('month') as string,
    label: formData.get('label') as string,
    amount: Number(formData.get('amount')),
    person: formData.get('person') as string,
  }

  const parsed = incomeSchema.safeParse(rawData)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const data = await updateIncomeRecord(id, {
      month: parsed.data.month,
      label: parsed.data.label,
      amount: parsed.data.amount,
      person: parsed.data.person,
    })
    revalidatePath('/')
    return { success: true, data }
  } catch (error) {
    console.error('収入更新エラー:', error)
    return { success: false, error: '収入の更新に失敗しました' }
  }
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  await requireAuth()

  try {
    await deleteIncomeRecord(id)
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('収入削除エラー:', error)
    return { success: false, error: '収入の削除に失敗しました' }
  }
}
