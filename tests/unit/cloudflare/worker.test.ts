import { describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from '../../../cloudflare/worker/src/d1'

class FakeStatement implements D1PreparedStatementLike {
  constructor(
    private readonly db: FakeD1Database,
    private readonly query: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    return new FakeStatement(this.db, this.query, values)
  }

  first<T>(): Promise<T | null> {
    return this.db.first<T>(this.query, this.params)
  }

  all<T>(): Promise<{ results: T[] }> {
    return this.db.all<T>(this.query, this.params)
  }

  run(): Promise<D1ResultLike> {
    return this.db.run(this.query, this.params)
  }
}

class FakeD1Database implements D1DatabaseLike {
  readonly executed: Array<{ query: string; params: unknown[] }> = []
  readonly batched: Array<Array<{ query: string; params: unknown[] }>> = []
  private incomeRows = [
    {
      id: 'income-1',
      month: '202601',
      label: '給料',
      amount: 300000,
      person: 'husband',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]
  private expenseRows = [
    {
      id: 'expense-1',
      month: '202601',
      label: '家賃',
      amount: -120000,
      person: 'wife',
      is_carryover: 0,
      created_at: '2026-01-02T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    },
  ]
  private carryoverRows = [
    {
      id: 'carryover-1',
      month: '202601',
      label: '立替',
      amount: -10000,
      person: 'husband',
      is_cleared: 0,
      created_at: '2026-01-03T00:00:00.000Z',
      updated_at: '2026-01-03T00:00:00.000Z',
    },
  ]

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this, query)
  }

  async batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
    const batch = statements.map((statement) => {
      const fakeStatement = statement as FakeStatement
      return {
        query: Reflect.get(fakeStatement, 'query') as string,
        params: Reflect.get(fakeStatement, 'params') as unknown[],
      }
    })
    this.batched.push(batch)
    for (const item of batch) {
      await this.run(item.query, item.params)
    }
    return batch.map(() => ({ success: true }))
  }

  async first<T>(query: string, params: unknown[]): Promise<T | null> {
    this.executed.push({ query, params })
    if (query.includes('FROM incomes')) {
      return (this.incomeRows.find((row) => row.id === params[0]) ?? null) as T | null
    }
    return null
  }

  async all<T>(query: string, params: unknown[]): Promise<{ results: T[] }> {
    this.executed.push({ query, params })
    if (query.includes('FROM incomes') && query.includes('WHERE month = ?')) {
      return {
        results: this.incomeRows.filter((row) => row.month === params[0]) as T[],
      }
    }
    if (query.includes('FROM incomes')) {
      return { results: this.incomeRows as T[] }
    }
    if (query.includes('FROM expenses')) {
      return { results: this.expenseRows as T[] }
    }
    if (query.includes('FROM carryovers')) {
      return { results: this.carryoverRows as T[] }
    }
    return { results: [] }
  }

  async run(query: string, params: unknown[]): Promise<D1ResultLike> {
    this.executed.push({ query, params })
    if (query.startsWith('INSERT INTO incomes')) {
      this.incomeRows.push({
        id: params[0] as string,
        month: params[1] as string,
        label: params[2] as string,
        amount: params[3] as number,
        person: params[4] as string,
        created_at: params[5] as string,
        updated_at: params[6] as string,
      })
    }
    if (query.startsWith('DELETE FROM incomes')) {
      this.incomeRows = this.incomeRows.filter((row) => row.month !== params[0])
    }
    return { success: true, meta: { changes: 1 } }
  }
}

function createRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://api.example.test${path}`, init)
}

function createEnv(db = new FakeD1Database()) {
  return {
    DB: db,
    WORKER_API_TOKEN: 'secret-token',
  }
}

describe('Cloudflare Worker API', () => {
  it('共有シークレットがないリクエストを拒否する', async () => {
    const response = await handleRequest(createRequest('/incomes?month=202601'), createEnv())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: '認証に失敗しました',
    })
  })

  it('指定月の収入一覧を返す', async () => {
    const response = await handleRequest(
      createRequest('/incomes?month=202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 'income-1',
          month: '202601',
          label: '給料',
          amount: 300000,
          person: 'husband',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('収入作成時にIDと日時をWorker側で生成する', async () => {
    const db = new FakeD1Database()
    const randomUUID = vi.fn(() => 'generated-id')
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const response = await handleRequest(
      createRequest('/incomes', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202602',
          label: '副業',
          amount: 50000,
          person: 'wife',
        }),
      }),
      createEnv(db),
      { randomUUID, now }
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 'generated-id',
        month: '202602',
        label: '副業',
        amount: 50000,
        person: 'wife',
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })
    expect(db.executed.some((item) => item.query.startsWith('INSERT INTO incomes'))).toBe(true)
  })

  it('月コピーのreplaceをD1 batchで実行する', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest('/copy-month', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'replace',
          includeCarryover: false,
          selectedItems: [
            {
              id: 'income-1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
          ],
        }),
      }),
      createEnv(db),
      {
        randomUUID: vi.fn(() => 'copied-income-id'),
        now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')),
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      copied: { incomes: 1, expenses: 0, carryovers: 0 },
      skipped: { incomes: 0, expenses: 0, carryovers: 0 },
    })
    expect(db.batched).toHaveLength(1)
    expect(db.batched[0].map((item) => item.query)).toEqual([
      'DELETE FROM incomes WHERE month = ?',
      expect.stringContaining('INSERT INTO incomes'),
    ])
  })
})
