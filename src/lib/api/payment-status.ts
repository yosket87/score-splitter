import 'server-only'
import { assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { householdSessionToken } from './household-session'
import { apiRequest } from './client'
import { getDatabase, getRuntime, isWorkerApiMockEnabled, runD1Operation } from './backend'
import * as store from '../../../cloudflare/worker/src/payment-status'
import type { Session } from '@/types'
import type { CorrectPaymentInput, PaymentOperationResult, PaymentStatus, RecordPaymentInput } from '@/types/payment-status'

async function mockRequest<T>(context: HouseholdContext, path: string, body?: unknown): Promise<T> {
  const sessionToken = await householdSessionToken(context)
  const result = await apiRequest<{ data: T }>(path, {
    sessionToken,
    ...(body === undefined ? {} : { method: 'POST', body }),
  })
  return result.data
}

export async function getPaymentStatus(context: HouseholdContext, month: string): Promise<PaymentStatus> {
  assertHouseholdContext(context)
  if (isWorkerApiMockEnabled()) return mockRequest(context, `/months/${month}/payment-status`)
  return runD1Operation(() => store.getPaymentStatus(getDatabase(), context, month))
}

export async function recordPayment(context: HouseholdContext & Session, input: RecordPaymentInput): Promise<PaymentOperationResult> {
  assertHouseholdContext(context)
  if (isWorkerApiMockEnabled()) return mockRequest(context, `/months/${input.month}/payments`, input)
  return runD1Operation(() => store.recordPayment(getDatabase(), getRuntime(), context, input))
}

export async function correctPayment(context: HouseholdContext & Session, input: CorrectPaymentInput): Promise<PaymentOperationResult> {
  assertHouseholdContext(context)
  if (isWorkerApiMockEnabled()) return mockRequest(context, `/months/${input.month}/payment-corrections`, input)
  return runD1Operation(() => store.correctPayment(getDatabase(), getRuntime(), context, input))
}

export async function getPaymentOperation(context: HouseholdContext, month: string, id: string): Promise<PaymentOperationResult | null> {
  assertHouseholdContext(context)
  if (isWorkerApiMockEnabled()) return mockRequest(context, `/months/${month}/payment-operations/${id}`)
  return runD1Operation(() => store.getPaymentOperation(getDatabase(), context, month, id))
}
