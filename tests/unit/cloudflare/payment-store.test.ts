import { describe, expect, it, vi } from 'vitest'
import { replayOperation, writeOperation } from '../../../cloudflare/worker/src/payment-store'
import { createRuntime, type D1DatabaseLike } from '../../../cloudflare/worker/src/d1'
const runtime = createRuntime({ now: () => new Date('2026-09-05T00:00:00Z') })
function mockDb(row: unknown = null) {
  const statement = { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(row), all: vi.fn(), run: vi.fn() }
  return { prepare: vi.fn().mockReturnValue(statement), batch: vi.fn().mockResolvedValue([{ success: true }]) }
}
describe('振込台帳', () => {
  it.each(['google', 'firebase'] as const)('%sの操作に内部利用者IDを記録する', async authMethod => {
    const db = mockDb()
    await writeOperation(db, { householdId: 'A' }, runtime, { operationId: 'id', month: '202609', expectedRevision: 0,
      kind: 'void', inputJson: '{}', actor: { person: 'wife', authMethod, userId: 'internal-user', membershipId: 'membership', sessionEpoch: 0 }, payment: null, voidPayment: null })
    expect(db.prepare.mock.results[0].value.bind.mock.calls[0]).toContain('internal-user')
  })
  it('同一操作は保存済み結果を返す', async () => {
    const result = { operationId: 'id', revision: 1 }
    expect(await replayOperation(mockDb({ input_json: 'input', result_json: JSON.stringify(result) }), { householdId: 'A' }, 'id', 'input')).toEqual(result)
  })
  it('同じキーの別入力は409', async () => await expect(replayOperation(mockDb({ input_json: 'old' }), { householdId: 'A' }, 'id', 'new')).rejects.toMatchObject({ status: 409 }))
  it('操作・振込・revisionを単一batchに含める', async () => {
    const db = mockDb()
    await writeOperation(db as D1DatabaseLike, { householdId: 'A' }, runtime, { operationId: 'id', month: '202609', expectedRevision: 0, kind: 'void', inputJson: '{}', actor: { person: null, authMethod: 'password' }, payment: null, voidPayment: { id: 'payment', reason: '誤操作' } })
    expect(db.batch).toHaveBeenCalledOnce()
    expect(db.batch.mock.calls[0][0]).toHaveLength(3)
  })
  it('DBで検出した競合を409へ変換', async () => {
    const db = mockDb()
    db.batch.mockRejectedValue(new Error('PAYMENT_REVISION_CONFLICT'))
    await expect(writeOperation(db, { householdId: 'A' }, runtime, { operationId: 'id', month: '202609', expectedRevision: 0, kind: 'void', inputJson: '{}', actor: { person: null, authMethod: 'password' }, payment: null, voidPayment: null })).rejects.toMatchObject({ status: 409 })
  })
})
