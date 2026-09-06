import { assertHouseholdContext, type HouseholdContext } from '../../cloudflare/worker/src/households'
import { buildPaymentStatus } from '@/lib/utils/payment-status'
import { assertPaymentDate, correctPaymentSchema, recordPaymentSchema } from '@/lib/validations/payment-status'
import type { Carryover, Expense, Income, Session } from '@/types'
import type { CorrectPaymentInput, PaymentOperationResult, PaymentRecord, PaymentSnapshot, RecordPaymentInput } from '@/types/payment-status'
import { getTable, incrementPaymentRevision, insertRows } from './db'
import { HttpError } from '../../cloudflare/worker/src/http'

function getInputs(context: HouseholdContext, month: string) {
  const rows = (table: string) => getTable(table).filter((row) => row.household_id === context.householdId && row.month === month).map((row) => ({
    id: String(row.id), month, label: String(row.label), amount: Number(row.amount),
    person: row.person as 'husband' | 'wife', createdAt: String(row.created_at),
    ...(table === 'expenses' ? { isCarryover: Boolean(row.is_carryover) } : {}),
    ...(table === 'carryovers' ? { isCleared: Boolean(row.is_cleared) } : {}),
  }))
  return { incomes: rows('incomes') as Income[], expenses: rows('expenses') as Expense[], carryovers: rows('carryovers') as Carryover[] }
}

export function getMockPaymentStatus(context: HouseholdContext, month: string) {
  assertHouseholdContext(context)
  const revision = Number(getTable('month_payment_revisions').find((row) => row.household_id === context.householdId && row.month === month)?.revision ?? 0)
  const payments = getTable('mock_payment_records').filter((row) => row.household_id === context.householdId && row.month === month).map((row) => {
    const payment = row.payment as PaymentRecord
    const voided = getTable('mock_payment_voids').find((item) => item.household_id === context.householdId && item.paymentId === payment.id)
    return { ...payment, voidedAt: voided ? String(voided.created_at) : null, voidReason: voided ? String(voided.reason) : null }
  })
  return buildPaymentStatus(month, revision, getInputs(context, month), payments)
}

export function getMockPaymentOperation(context: HouseholdContext, month: string, id: string): PaymentOperationResult | null {
  assertHouseholdContext(context)
  return getTable('mock_payment_operations').find((row) => row.household_id === context.householdId && row.month === month && row.id === id)?.result as PaymentOperationResult ?? null
}

function replay(context: HouseholdContext, kind: string, input: RecordPaymentInput | CorrectPaymentInput) {
  const old = getTable('mock_payment_operations').find((row) => row.household_id === context.householdId && row.id === input.operationId)
  if (!old) return null
  if (old.request !== JSON.stringify({ kind, input })) throw new HttpError('同じ操作IDで内容が異なります。', 409)
  return old.result as PaymentOperationResult
}

function makeRecord(context: HouseholdContext, input: { month: string; signedYen: number; paidOn: string }, actor: Session): PaymentRecord {
  const inputs = getInputs(context, input.month)
  const snapshot: PaymentSnapshot = {
    schemaVersion: 1, ...inputs, calculation: getMockPaymentStatus(context, input.month).calculation,
    calculationVersion: 'equal-surplus-v1', roundingVersion: 'toward-zero-yen-v1',
  }
  return { id: crypto.randomUUID(), ...input, actor: { person: actor.person, authMethod: actor.authMethod }, snapshot: structuredClone(snapshot), createdAt: new Date().toISOString(), voidedAt: null, voidReason: null }
}

function commit(context: HouseholdContext, kind: string, input: RecordPaymentInput | CorrectPaymentInput, payment: PaymentRecord | null, voidId: string | null): PaymentOperationResult {
  const result = { operationId: input.operationId, month: input.month, revision: getMockPaymentStatus(context, input.month).revision + 1, paymentId: payment?.id ?? null, voidedPaymentId: voidId }
  if (payment) insertRows('mock_payment_records', [{ household_id: context.householdId, month: input.month, payment }])
  if (voidId && 'reason' in input) insertRows('mock_payment_voids', [{ household_id: context.householdId, paymentId: voidId, reason: input.reason }])
  insertRows('mock_payment_operations', [{ household_id: context.householdId, id: input.operationId, month: input.month, request: JSON.stringify({ kind, input }), result }])
  incrementPaymentRevision(context.householdId, input.month)
  return result
}

export function recordMockPayment(context: HouseholdContext & Session, body: unknown): PaymentOperationResult {
  assertHouseholdContext(context)
  const input = recordPaymentSchema.parse(body)
  const old = replay(context, 'record', input)
  if (old) return old
  const current = getMockPaymentStatus(context, input.month)
  if (current.revision !== input.expectedRevision || current.remainingSignedYen !== input.confirmedSignedYen) throw new HttpError('内容が変更されました。金額を確認し直してください。', 409)
  validateDate(input.paidOn)
  return commit(context, 'record', input, makeRecord(context, { month: input.month, signedYen: input.confirmedSignedYen, paidOn: input.paidOn }, context), null)
}

export function correctMockPayment(context: HouseholdContext & Session, body: unknown): PaymentOperationResult {
  assertHouseholdContext(context)
  const input = correctPaymentSchema.parse(body)
  const old = replay(context, 'correct', input)
  if (old) return old
  const status = getMockPaymentStatus(context, input.month)
  const payment = status.payments.find((item) => item.id === input.paymentId)
  if (!payment) throw new HttpError('振込記録が見つかりません。', 404)
  if (status.revision !== input.expectedRevision) throw new HttpError('記録が変更されました。確認し直してください。', 409)
  if (payment.voidedAt) throw new HttpError('すでに取り消されています。', 409)
  if (input.replacement) validateDate(input.replacement.paidOn)
  try {
    buildPaymentStatus(input.month, status.revision, getInputs(context, input.month), [
      ...status.payments.filter((item) => item.id !== payment.id),
      ...(input.replacement ? [{ ...payment, ...input.replacement }] : []),
    ])
  } catch { throw new HttpError('金額が安全に計算できる範囲を超えています。', 400) }
  const replacement = input.replacement ? makeRecord(context, { month: input.month, ...input.replacement }, context) : null
  return commit(context, 'correct', input, replacement, payment.id)
}

function validateDate(value: string): void {
  try { assertPaymentDate(value, new Date()) }
  catch { throw new HttpError('支払日は実在する今日以前の日付を指定してください。', 400) }
}
