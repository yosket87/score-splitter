import { assertHouseholdContext, type HouseholdContext } from './households'
import type { D1DatabaseLike, Runtime } from './d1'
import type { Session } from '../../../src/types'
import type {
  PaymentOperationResult,
  PaymentRecord,
  PaymentSnapshot,
} from '../../../src/types/payment-status'
import type { PaymentEntries } from '../../../src/lib/utils/payment-status'
import { mapIncome, mapExpense, mapCarryover } from './records'
import { HttpError } from './http'

type RecordRow = Parameters<typeof mapIncome>[0]
type PaymentRow = {
  id: string
  month: string
  signed_yen: number
  paid_on: string
  created_at: string
  snapshot_json: string
  actor_person: Session['person']
  actor_auth_method: Session['authMethod']
  voided_at: string | null
  reason: string | null
}

interface PaymentMonthData {
  revision: number
  entries: PaymentEntries
  payments: PaymentRecord[]
}

export async function readPaymentMonth(
  db: D1DatabaseLike,
  context: HouseholdContext,
  month: string
): Promise<PaymentMonthData> {
  assertHouseholdContext(context)
  const result = await db.batch([
    db.prepare('SELECT revision FROM month_payment_revisions WHERE household_id = ? AND month = ?').bind(context.householdId, month),
    ...['incomes', 'expenses', 'carryovers'].map(table =>
      db.prepare(`SELECT * FROM ${table} WHERE household_id = ? AND month = ? ORDER BY id`).bind(context.householdId, month)
    ),
    db.prepare(`
      SELECT p.*, o.actor_person, o.actor_auth_method, v.created_at AS voided_at, v.reason
      FROM payment_records p
      JOIN payment_operations o ON o.household_id = p.household_id AND o.id = p.operation_id
      LEFT JOIN payment_voids v ON v.household_id = p.household_id AND v.payment_id = p.id
      WHERE p.household_id = ? AND p.month = ? ORDER BY p.created_at DESC, p.id DESC
    `).bind(context.householdId, month),
  ])
  if (result.some(statement => !statement.success)) {
    throw new HttpError('振込状況を取得できませんでした', 500)
  }
  return {
    revision: (result[0].results?.[0] as { revision: number } | undefined)?.revision ?? 0,
    entries: {
      incomes: (result[1].results as RecordRow[]).map(mapIncome),
      expenses: (result[2].results as RecordRow[]).map(mapExpense),
      carryovers: (result[3].results as RecordRow[]).map(mapCarryover),
    },
    payments: (result[4].results as PaymentRow[]).map(row => ({
      id: row.id,
      month: row.month,
      signedYen: row.signed_yen,
      paidOn: row.paid_on,
      createdAt: row.created_at,
      actor: { person: row.actor_person, authMethod: row.actor_auth_method },
      snapshot: JSON.parse(row.snapshot_json) as PaymentSnapshot,
      voidedAt: row.voided_at,
      voidReason: row.reason,
    })),
  }
}

export async function findOperation(db: D1DatabaseLike, context: HouseholdContext, id: string) {
  assertHouseholdContext(context)
  return db
    .prepare('SELECT month, input_json, result_json FROM payment_operations WHERE household_id = ? AND id = ?')
    .bind(context.householdId, id)
    .first<{ month: string; input_json: string; result_json: string }>()
}

export async function replayOperation(
  db: D1DatabaseLike,
  context: HouseholdContext,
  id: string,
  inputJson: string
): Promise<PaymentOperationResult | null> {
  assertHouseholdContext(context)
  const existing = await findOperation(db, context, id)
  if (!existing) return null
  if (existing.input_json !== inputJson) {
    throw new HttpError('同じ操作キーで異なる内容は記録できません', 409)
  }
  return JSON.parse(existing.result_json) as PaymentOperationResult
}

interface WriteOperation {
  operationId: string
  month: string
  expectedRevision: number
  kind: 'record' | 'correct' | 'void'
  inputJson: string
  actor: Session
  payment: {
    signedYen: number
    paidOn: string
    snapshot: PaymentSnapshot
  } | null
  voidPayment: {
    id: string
    reason: string
  } | null
}
/** 操作・取消・置換を一つのbatchで確定する。途中失敗では全件ロールバックする。 */
export async function writeOperation(
  db: D1DatabaseLike,
  context: HouseholdContext,
  runtime: Runtime,
  input: WriteOperation
): Promise<PaymentOperationResult> {
  assertHouseholdContext(context)
  const now = runtime.now().toISOString()
  const paymentId = input.payment ? runtime.randomUUID() : null
  const result: PaymentOperationResult = {
    operationId: input.operationId,
    month: input.month,
    revision: input.expectedRevision + 1,
    paymentId,
    voidedPaymentId: input.voidPayment?.id ?? null,
  }
  const statements = [
    db.prepare(`
      INSERT INTO payment_operations(
        household_id,id,month,kind,expected_revision,input_json,result_json,
        actor_person,actor_auth_method,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(
      context.householdId, input.operationId, input.month, input.kind, input.expectedRevision,
      input.inputJson, JSON.stringify(result), input.actor.person,
      input.actor.authMethod, now
    ),
  ]
  if (input.voidPayment) {
    statements.push(db.prepare(`
      INSERT INTO payment_voids(household_id,id,operation_id,payment_id,reason,created_at)
      VALUES(?,?,?,?,?,?)
    `).bind(
      context.householdId, runtime.randomUUID(), input.operationId, input.voidPayment.id,
      input.voidPayment.reason, now
    ))
  }
  if (input.payment) {
    statements.push(db.prepare(`
      INSERT INTO payment_records(
        household_id,id,operation_id,month,signed_yen,paid_on,created_at,
        snapshot_json,calculation_version,rounding_version
      ) VALUES(?,?,?,?,?,?,?,?,?,?)
    `).bind(
      context.householdId, paymentId, input.operationId, input.month, input.payment.signedYen,
      input.payment.paidOn, now, JSON.stringify(input.payment.snapshot),
      'equal-surplus-v1', 'toward-zero-yen-v1'
    ))
  }
  statements.push(db.prepare(`
    INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(?,?,1)
    ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1
  `).bind(context.householdId, input.month))
  try {
    const results = await db.batch(statements)
    if (results.some(statement => !statement.success)) {
      throw new Error('振込台帳の保存に失敗しました')
    }
    return result
  } catch (error) {
    const replay = await replayOperation(db, context, input.operationId, input.inputJson)
    if (replay) return replay
    const conflictPattern = /PAYMENT_REVISION_CONFLICT|UNIQUE constraint failed: payment_voids.household_id, payment_voids.payment_id/
    if (error instanceof Error && conflictPattern.test(error.message)) {
      throw new HttpError('確認後にデータが変更されました。最新の振込状況を確認してください', 409)
    }
    throw new HttpError('振込記録を保存できませんでした。操作結果を確認してください', 500)
  }
}
