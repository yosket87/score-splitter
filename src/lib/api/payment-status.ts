import 'server-only'
import { cookies } from 'next/headers'
import { apiRequest } from './client'
import { getDatabase, getRuntime, isWorkerApiMockEnabled, runD1Operation } from './backend'
import * as store from '../../../cloudflare/worker/src/payment-status'
import type { Session } from '@/types'
import type { CorrectPaymentInput, PaymentOperationResult, PaymentStatus, RecordPaymentInput } from '@/types/payment-status'

async function mockRequest<T>(path: string, body?: unknown): Promise<T> {
  const sessionToken = (await cookies()).get('household_session')?.value ?? ''
  const result = await apiRequest<{ data: T }>(path, {
    sessionToken,
    ...(body === undefined ? {} : { method: 'POST', body }),
  })
  return result.data
}

export async function getPaymentStatus(month: string): Promise<PaymentStatus> {
  if (isWorkerApiMockEnabled()) return mockRequest(`/months/${month}/payment-status`)
  return runD1Operation(() => store.getPaymentStatus(getDatabase(), month))
}

export async function recordPayment(input: RecordPaymentInput, actor: Session): Promise<PaymentOperationResult> {
  if (isWorkerApiMockEnabled()) return mockRequest(`/months/${input.month}/payments`, input)
  return runD1Operation(() => store.recordPayment(getDatabase(), getRuntime(), input, actor))
}

export async function correctPayment(input: CorrectPaymentInput, actor: Session): Promise<PaymentOperationResult> {
  if (isWorkerApiMockEnabled()) return mockRequest(`/months/${input.month}/payment-corrections`, input)
  return runD1Operation(() => store.correctPayment(getDatabase(), getRuntime(), input, actor))
}

export async function getPaymentOperation(month: string, id: string): Promise<PaymentOperationResult | null> {
  if (isWorkerApiMockEnabled()) return mockRequest(`/months/${month}/payment-operations/${id}`)
  return runD1Operation(() => store.getPaymentOperation(getDatabase(), month, id))
}
