'use server'

import { z } from 'zod'
import { assertHouseholdContext } from '@/lib/household-context'
import { getSession } from '@/lib/webauthn/session'
import type { SessionInfo } from '@/lib/webauthn/session'
import { isValidMonth } from '@/lib/utils/format'
import { ApiError } from '@/lib/api/client'
import * as api from '@/lib/api/payment-status'
import { recordPaymentSchema, correctPaymentSchema } from '@/lib/validations/payment-status'
import { revalidateHouseholdData } from './revalidation'
import type { CorrectPaymentInput, PaymentActionResult, PaymentOperationResult, PaymentStatus, RecordPaymentInput } from '@/types/payment-status'

async function authenticated<T>(
  operation: (actor: SessionInfo) => Promise<T>,
  errorMessage: string,
  expectedHouseholdId: string
): Promise<PaymentActionResult<T>> {
  try {
    const actor = await getSession()
    if (!actor) return { success: false, code: 401, error: 'ログインし直してください。' }
    assertHouseholdContext(actor)
    // 操作元の世帯は認可に使わず、古い画面からの操作を拒否するために照合する。
    if (typeof expectedHouseholdId !== 'string' || !expectedHouseholdId.trim() || actor.householdId !== expectedHouseholdId) {
      return { success: false, code: 403, error: 'ログイン中の世帯が変わりました。記録時の世帯でログインし直してください。' }
    }
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

export async function getPaymentStatus(month: string, expectedHouseholdId: string): Promise<PaymentActionResult<PaymentStatus>> {
  return authenticated(
    (actor) => api.getPaymentStatus(actor, validateMonth(month)),
    '振込記録を取得できませんでした。もう一度お試しください。',
    expectedHouseholdId
  )
}

export async function recordPayment(input: RecordPaymentInput, expectedHouseholdId: string): Promise<PaymentActionResult<PaymentOperationResult>> {
  return authenticated(async (actor) => {
    const parsed = recordPaymentSchema.parse(input)
    const result = await api.recordPayment(actor, parsed)
    revalidateHouseholdData(result.month)
    return result
  }, '振込記録の結果を確認できませんでした。同じ操作でもう一度確認してください。', expectedHouseholdId)
}

export async function correctPayment(input: CorrectPaymentInput, expectedHouseholdId: string): Promise<PaymentActionResult<PaymentOperationResult>> {
  return authenticated(async (actor) => {
    const parsed = correctPaymentSchema.parse(input)
    const result = await api.correctPayment(actor, parsed)
    revalidateHouseholdData(result.month)
    return result
  }, '訂正の結果を確認できませんでした。同じ操作でもう一度確認してください。', expectedHouseholdId)
}

export async function getPaymentOperation(month: string, operationId: string, expectedHouseholdId: string): Promise<PaymentActionResult<PaymentOperationResult | null>> {
  return authenticated(
    (actor) => api.getPaymentOperation(actor, validateMonth(month), z.string().uuid().parse(operationId)),
    '振込記録の結果を確認できませんでした。もう一度お試しください。',
    expectedHouseholdId
  )
}
