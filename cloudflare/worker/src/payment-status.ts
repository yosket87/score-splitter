import { assertHouseholdContext, type HouseholdContext } from './households'
import type { D1DatabaseLike, Runtime } from './d1'
import type { Session } from '../../../src/types'
import type {
  PaymentSnapshot,
  PaymentStatus,
  PaymentOperationResult,
} from '../../../src/types/payment-status'
import { buildPaymentStatus } from '../../../src/lib/utils/payment-status'
import {
  recordPaymentSchema,
  correctPaymentSchema,
  assertPaymentDate,
} from '../../../src/lib/validations/payment-status'
import { readPaymentMonth, findOperation, replayOperation, writeOperation } from './payment-store'
import { HttpError } from './http'
import { parseMonth } from './validation'

async function readCurrentStatus(db: D1DatabaseLike, context: HouseholdContext, month: string) {
  const data = await readPaymentMonth(db, context, month)
  try {
    return { ...data, status: buildPaymentStatus(month, data.revision, data.entries, data.payments) }
  } catch {
    throw new HttpError('金額が安全に計算できる範囲を超えています', 400)
  }
}

function validatePaidOn(value: string, now: Date) {
  try {
    assertPaymentDate(value, now)
  } catch {
    throw new HttpError('支払日は実在する今日以前の日付を指定してください', 400)
  }
}

function createSnapshot(data: Awaited<ReturnType<typeof readCurrentStatus>>): PaymentSnapshot {
  return {
    schemaVersion: 1,
    ...data.entries,
    calculation: data.status.calculation,
    calculationVersion: 'equal-surplus-v1',
    roundingVersion: 'toward-zero-yen-v1',
  }
}

export async function getPaymentStatus(db: D1DatabaseLike, context: HouseholdContext, month: string): Promise<PaymentStatus> {
  assertHouseholdContext(context)
  return (await readCurrentStatus(db, context, parseMonth(month))).status
}

export async function getPaymentOperation(
  db: D1DatabaseLike,
  context: HouseholdContext,
  month: string,
  id: string
): Promise<PaymentOperationResult | null> {
  assertHouseholdContext(context)
  parseMonth(month)
  const row = await findOperation(db, context, id)
  return row?.month === month ? JSON.parse(row.result_json) as PaymentOperationResult : null
}

export async function recordPayment(
  db: D1DatabaseLike,
  runtime: Runtime,
  context: HouseholdContext & Session,
  body: unknown
): Promise<PaymentOperationResult> {
  assertHouseholdContext(context)
  const parsed = recordPaymentSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError('振込記録の入力が不正です', 400)
  }
  const input = parsed.data
  const inputJson = JSON.stringify({ kind: 'record', ...input })
  const replay = await replayOperation(db, context, input.operationId, inputJson)
  if (replay) return replay
  validatePaidOn(input.paidOn, runtime.now())
  const data = await readCurrentStatus(db, context, input.month)
  if (
    input.expectedRevision !== data.revision ||
    input.confirmedSignedYen !== data.status.remainingSignedYen
  ) {
    throw new HttpError('確認後に精算額が変更されました。最新の振込状況を確認してください', 409)
  }
  return writeOperation(db, context, runtime, {
    ...input,
    kind: 'record',
    inputJson,
    actor: context,
    payment: {
      signedYen: input.confirmedSignedYen,
      paidOn: input.paidOn,
      snapshot: createSnapshot(data),
    },
    voidPayment: null,
  })
}

export async function correctPayment(
  db: D1DatabaseLike,
  runtime: Runtime,
  context: HouseholdContext & Session,
  body: unknown
): Promise<PaymentOperationResult> {
  assertHouseholdContext(context)
  const parsed = correctPaymentSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError('振込訂正の入力が不正です', 400)
  }
  const input = parsed.data
  const kind = input.replacement ? 'correct' : 'void'
  const inputJson = JSON.stringify({ kind, ...input })
  const replay = await replayOperation(db, context, input.operationId, inputJson)
  if (replay) return replay
  if (input.replacement) {
    validatePaidOn(input.replacement.paidOn, runtime.now())
  }
  const data = await readCurrentStatus(db, context, input.month)
  const payment = data.payments.find(payment => payment.id === input.paymentId)
  if (!payment) {
    throw new HttpError('振込記録が見つかりません', 404)
  }
  if (payment.voidedAt || input.expectedRevision !== data.revision) {
    throw new HttpError('振込記録が変更されました。最新の状況を確認してください', 409)
  }
  // 訂正後も安全に差額を表示できることを、書き込む前に確認する。
  try {
    const correctedPayments = [
      ...data.payments.filter(record => record.id !== payment.id),
      ...(input.replacement ? [{ ...payment, ...input.replacement }] : []),
    ]
    buildPaymentStatus(input.month, data.revision, data.entries, correctedPayments)
  } catch {
    throw new HttpError('金額が安全に計算できる範囲を超えています', 400)
  }
  return writeOperation(db, context, runtime, {
    ...input,
    kind,
    inputJson,
    actor: context,
    payment: input.replacement ? { ...input.replacement, snapshot: createSnapshot(data) } : null,
    voidPayment: { id: payment.id, reason: input.reason },
  })
}
