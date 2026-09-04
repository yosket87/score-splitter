import { z } from 'zod'
import { isValidMonth } from '../utils/format'

const monthSchema = z.string().refine(isValidMonth)
const signedYenSchema = z.number()
  .int()
  .refine(Number.isSafeInteger)
  .refine(value => value !== 0)
const paymentDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  })

const operationFields = {
  month: monthSchema,
  operationId: z.string().uuid(),
  expectedRevision: z.number()
    .int()
    .nonnegative()
    .refine(value => Number.isSafeInteger(value + 1)),
}

export const recordPaymentSchema = z.object({
  ...operationFields,
  confirmedSignedYen: signedYenSchema,
  paidOn: paymentDateSchema,
}).strict()

export const correctPaymentSchema = z.object({
  ...operationFields,
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  replacement: z.object({
    signedYen: signedYenSchema,
    paidOn: paymentDateSchema,
  }).strict().nullable(),
}).strict()

/** 支払日は日本時間の日付として検証し、時刻は保存しない。 */
export function assertPaymentDate(value: string, now: Date): void {
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (!paymentDateSchema.safeParse(value).success || value > today) {
    throw new Error('支払日は実在する今日以前の日付を指定してください')
  }
}
