import type { CalculationResult, Carryover, Expense, Income, Session } from './index'

export interface PaymentSnapshot {
  schemaVersion: 1
  incomes: Income[]
  expenses: Expense[]
  carryovers: Carryover[]
  calculation: CalculationResult
  calculationVersion: 'equal-surplus-v1'
  roundingVersion: 'toward-zero-yen-v1'
}

export interface PaymentRecord {
  id: string
  month: string
  signedYen: number
  paidOn: string
  createdAt: string
  actor: Session
  snapshot: PaymentSnapshot
  voidedAt: string | null
  voidReason: string | null
}

export interface PaymentStatus {
  month: string
  revision: number
  calculation: CalculationResult
  targetSignedYen: number
  netPaidSignedYen: number
  remainingSignedYen: number
  state: 'unpaid' | 'paid' | 'difference' | 'unnecessary'
  payments: PaymentRecord[]
}

export interface RecordPaymentInput {
  month: string
  operationId: string
  expectedRevision: number
  confirmedSignedYen: number
  paidOn: string
}

export interface CorrectPaymentInput {
  month: string
  operationId: string
  expectedRevision: number
  paymentId: string
  reason: string
  replacement: { signedYen: number; paidOn: string } | null
}

export interface PaymentOperationResult {
  operationId: string
  month: string
  revision: number
  paymentId: string | null
  voidedPaymentId: string | null
}

export type PaymentActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: number }
