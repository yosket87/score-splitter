'use server'

import { z } from 'zod'
import { getSession } from '@/lib/webauthn/session'
import { isValidMonth } from '@/lib/utils/format'
import { ApiError } from '@/lib/api/client'
import * as api from '@/lib/api/payment-status'
import { recordPaymentSchema, correctPaymentSchema } from '@/lib/validations/payment-status'
import { revalidateHouseholdData } from './revalidation'
import type { Session } from '@/types'
import type { CorrectPaymentInput, PaymentActionResult, PaymentOperationResult, PaymentStatus, RecordPaymentInput } from '@/types/payment-status'

async function authenticated<T>(
  operation: (actor: Session) => Promise<T>,
  errorMessage: string
): Promise<PaymentActionResult<T>> {
  try {
    const actor = await getSession()
    if (!actor) return { success: false, code: 401, error: 'ログインし直してください。' }
    return { success: true, data: await operation(actor) }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, code: 400, error: '入力内容を確認してください。' }
    }
    if (error instanceof ApiError && error.status < 500) {
      return { success: false, code: error.status, error: error.message }
    }
    return { success: false, code: 500, error: errorMessage }
  }
}

function validateMonth(month: string) {
  if (!isValidMonth(month)) throw new ApiError('月が不正です。', 400)
  return month
}

export async function getPaymentStatus(month: string): Promise<PaymentActionResult<PaymentStatus>> {
  return authenticated(
    () => api.getPaymentStatus(validateMonth(month)),
    '振込記録を取得できませんでした。もう一度お試しください。'
  )
}

export async function recordPayment(input: RecordPaymentInput): Promise<PaymentActionResult<PaymentOperationResult>> {
  return authenticated(async (actor) => {
    const parsed = recordPaymentSchema.parse(input)
    const result = await api.recordPayment(parsed, actor)
    revalidateHouseholdData(result.month)
    return result
  }, '振込記録の結果を確認できませんでした。同じ操作でもう一度確認してください。')
}

export async function correctPayment(input: CorrectPaymentInput): Promise<PaymentActionResult<PaymentOperationResult>> {
  return authenticated(async (actor) => {
    const parsed = correctPaymentSchema.parse(input)
    const result = await api.correctPayment(parsed, actor)
    revalidateHouseholdData(result.month)
    return result
  }, '訂正の結果を確認できませんでした。同じ操作でもう一度確認してください。')
}

export async function getPaymentOperation(month: string, operationId: string): Promise<PaymentActionResult<PaymentOperationResult | null>> {
  return authenticated(
    () => api.getPaymentOperation(validateMonth(month), z.string().uuid().parse(operationId)),
    '振込記録の結果を確認できませんでした。もう一度お試しください。'
  )
}
