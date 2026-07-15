import { describe, expect, it } from 'vitest'
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  Runtime,
} from '../../../cloudflare/worker/src/d1'
import { HttpError } from '../../../cloudflare/worker/src/http'
import {
  createRecord,
  deleteRecord,
  insertRecordStatement,
  listMonthlyAmounts,
  listRecordsByMonth,
  mapCarryover,
  mapExpense,
  mapIncome,
  mapRecord,
  patchRecordFlag,
  updateRecord,
} from '../../../cloudflare/worker/src/records'

type Execution = {
  query: string
  params: unknown[]
  method: 'all' | 'first' | 'run'
}

class SpyStatement implements D1PreparedStatementLike {
  constructor(
    private readonly db: SpyDatabase,
    private readonly query: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    return new SpyStatement(this.db, this.query, values)
  }

  first<T>(): Promise<T | null> {
    this.db.executions.push({ query: this.query, params: this.params, method: 'first' })
    return Promise.resolve(this.db.firstResult as T | null)
  }

  all<T>(): Promise<{ results: T[] }> {
    this.db.executions.push({ query: this.query, params: this.params, method: 'all' })
    return Promise.resolve({ results: this.db.resolveAll(this.query) as T[] })
  }

  run(): Promise<D1ResultLike> {
    this.db.executions.push({ query: this.query, params: this.params, method: 'run' })
    return Promise.resolve({ success: true })
  }
}

class SpyDatabase implements D1DatabaseLike {
  readonly executions: Execution[] = []
  firstResult: unknown = null
  allResults: Array<{ pattern: string; results: unknown[] }> = []

  prepare(query: string): D1PreparedStatementLike {
    return new SpyStatement(this, query)
  }

  async batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
    return Promise.all(statements.map((statement) => statement.run()))
  }

  resolveAll(query: string): unknown[] {
    return this.allResults.find(({ pattern }) => query.includes(pattern))?.results ?? []
  }
}

const NOW = '2026-07-15T00:00:00.000Z'
const runtime: Runtime = {
  randomUUID: () => 'record-id',
  now: () => new Date(NOW),
}

const baseRow = {
  id: 'record-id',
  month: '202607',
  label: 'テスト項目',
  amount: 1000,
  person: 'husband' as const,
  created_at: NOW,
  updated_at: NOW,
}

describe('Cloudflare Worker レコード操作', () => {
  it('D1の行をAPIレスポンスへ変換する', () => {
    expect(mapIncome(baseRow)).toEqual({
      id: 'record-id',
      month: '202607',
      label: 'テスト項目',
      amount: 1000,
      person: 'husband',
      createdAt: NOW,
    })
    expect(mapExpense({ ...baseRow, amount: -1000, is_carryover: 1 }).isCarryover).toBe(true)
    expect(mapExpense({ ...baseRow, amount: -1000, is_carryover: 0 }).isCarryover).toBe(false)
    expect(mapCarryover({ ...baseRow, amount: -1000, is_cleared: 1 }).isCleared).toBe(true)
    expect(mapCarryover({ ...baseRow, amount: -1000, is_cleared: 0 }).isCleared).toBe(false)
    expect(mapRecord('income', baseRow)).not.toHaveProperty('isCarryover')
    expect(mapRecord('expense', { ...baseRow, amount: -1000, is_carryover: 1 })).toMatchObject({
      isCarryover: true,
    })
    expect(mapRecord('carryover', { ...baseRow, amount: -1000, is_cleared: 1 })).toMatchObject({
      isCleared: true,
    })
  })

  it.each([
    ['income', 'incomes', 'amount DESC, id ASC'],
    ['expense', 'expenses', 'amount ASC, id ASC'],
    ['carryover', 'carryovers', 'created_at ASC, id ASC'],
  ] as const)('%sの月別一覧を規定順で取得する', async (type, table, order) => {
    const db = new SpyDatabase()
    db.allResults = [
      {
        pattern: `FROM ${table}`,
        results: [
          {
            ...baseRow,
            amount: type === 'income' ? 1000 : -1000,
            is_carryover: 1,
            is_cleared: 1,
          },
        ],
      },
    ]

    const records = await listRecordsByMonth(db, type, '202607')

    expect(records).toHaveLength(1)
    expect(db.executions[0]).toEqual({
      query: `SELECT * FROM ${table} WHERE month = ? ORDER BY ${order}`,
      params: ['202607'],
      method: 'all',
    })
  })

  it('月別集計用の収入・支出を並列取得する', async () => {
    const db = new SpyDatabase()
    db.allResults = [
      { pattern: 'FROM incomes', results: [{ month: '202607', amount: 300000 }] },
      { pattern: 'FROM expenses', results: [{ month: '202607', amount: -120000 }] },
    ]

    await expect(listMonthlyAmounts(db)).resolves.toEqual({
      incomes: [{ month: '202607', amount: 300000 }],
      expenses: [{ month: '202607', amount: -120000 }],
    })
  })

  it.each([
    ['income', { amount: 1000 }, 'incomes', undefined],
    ['expense', { amount: -1000, isCarryover: true }, 'expenses', 1],
    ['expense', { amount: -1000 }, 'expenses', 0],
    ['carryover', { amount: -1000, isCleared: true }, 'carryovers', 1],
    ['carryover', { amount: -1000 }, 'carryovers', 0],
  ] as const)('%sレコードを作成する', async (type, extra, table, flag) => {
    const db = new SpyDatabase()

    const result = await createRecord(db, runtime, type, {
      month: '202607',
      label: 'テスト項目',
      person: 'husband',
      ...extra,
    })

    const execution = db.executions[0]
    expect(execution.query).toContain(`INSERT INTO ${table}`)
    expect(execution.params).toContain('record-id')
    if (flag !== undefined) expect(execution.params).toContain(flag)
    expect(result).toMatchObject({ id: 'record-id', createdAt: NOW })
  })

  it.each([
    ['income', { amount: 2000 }, 'incomes', { ...baseRow, amount: 2000 }],
    [
      'expense',
      { amount: -2000, isCarryover: true },
      'expenses',
      { ...baseRow, amount: -2000, is_carryover: 1 },
    ],
    ['expense', { amount: -2000 }, 'expenses', { ...baseRow, amount: -2000, is_carryover: 0 }],
    [
      'carryover',
      { amount: -2000, isCleared: true },
      'carryovers',
      { ...baseRow, amount: -2000, is_cleared: 1 },
    ],
    [
      'carryover',
      { amount: -2000 },
      'carryovers',
      { ...baseRow, amount: -2000, is_cleared: 0 },
    ],
  ] as const)('%sレコードを更新する', async (type, extra, table, row) => {
    const db = new SpyDatabase()
    db.firstResult = row

    const result = await updateRecord(db, runtime, type, 'record-id', {
      label: '更新項目',
      person: 'wife',
      ...extra,
    })

    expect(db.executions[0].query).toContain(`UPDATE ${table}`)
    expect(db.executions[1].query).toBe(`SELECT * FROM ${table} WHERE id = ?`)
    expect(result.id).toBe('record-id')
  })

  it('更新対象が存在しない場合は404エラーにする', async () => {
    const db = new SpyDatabase()

    await expect(
      updateRecord(db, runtime, 'income', 'missing-id', {
        label: '更新項目',
        amount: 2000,
        person: 'wife',
      })
    ).rejects.toEqual(expect.objectContaining<HttpError>({ status: 404 }))
  })

  it.each([
    ['expense', { isCarryover: true }, 'expenses', 1],
    ['expense', { isCarryover: false }, 'expenses', 0],
    ['carryover', { isCleared: true }, 'carryovers', 1],
    ['carryover', { isCleared: false }, 'carryovers', 0],
  ] as const)('%sの状態フラグを更新する', async (type, body, table, flag) => {
    const db = new SpyDatabase()

    await patchRecordFlag(db, runtime, type, 'record-id', body)

    expect(db.executions[0].query).toContain(`UPDATE ${table}`)
    expect(db.executions[0].params).toEqual([flag, NOW, 'record-id'])
  })

  it.each([
    ['income', 'incomes'],
    ['expense', 'expenses'],
    ['carryover', 'carryovers'],
  ] as const)('%sレコードを削除する', async (type, table) => {
    const db = new SpyDatabase()

    await deleteRecord(db, type, 'record-id')

    expect(db.executions[0]).toEqual({
      query: `DELETE FROM ${table} WHERE id = ?`,
      params: ['record-id'],
      method: 'run',
    })
  })

  it.each([
    ['income', {}, 'incomes', undefined],
    ['expense', { isCarryover: true }, 'expenses', 1],
    ['expense', { isCarryover: false }, 'expenses', 0],
    ['carryover', { isCleared: true }, 'carryovers', 1],
    ['carryover', { isCleared: false }, 'carryovers', 0],
  ] as const)('%sの一括登録ステートメントを構築する', async (type, flags, table, flag) => {
    const db = new SpyDatabase()

    await insertRecordStatement(db, runtime, type, {
      month: '202607',
      label: '一括登録',
      amount: type === 'income' ? 1000 : -1000,
      person: 'wife',
      ...flags,
    }).run()

    expect(db.executions[0].query).toContain(`INSERT INTO ${table}`)
    if (flag !== undefined) expect(db.executions[0].params).toContain(flag)
  })
})
