import { describe, expect, it } from 'vitest'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from '../../../cloudflare/worker/src/d1'

class FakeStatement implements D1PreparedStatementLike {
  private values: unknown[] = []

  constructor(
    private readonly db: FakeWaitlistDb,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.values = values
    return this
  }

  first<T>(): Promise<T | null> {
    throw new Error('not implemented')
  }

  all<T>(): Promise<{ results: T[] }> {
    throw new Error('not implemented')
  }

  async run(): Promise<D1ResultLike> {
    this.db.runs.push({ query: this.query, values: this.values })
    return { success: true }
  }
}

class FakeWaitlistDb implements D1DatabaseLike {
  runs: { query: string; values: unknown[] }[] = []

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this, query)
  }

  batch(): Promise<D1ResultLike[]> {
    throw new Error('not implemented')
  }
}

const deps = {
  randomUUID: () => 'waitlist-uuid-1',
  now: () => new Date('2026-07-05T00:00:00.000Z'),
}

function waitlistRequest(body: unknown): Request {
  return new Request('https://worker.local/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createEnv(db: FakeWaitlistDb) {
  return { DB: db, WORKER_API_TOKEN: 'test-token' }
}

describe('POST /waitlist', () => {
  it('認証ヘッダなしで登録でき、正規化した値でINSERTする', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({
        email: ' Couple@Example.com ',
        priceIntent: 'paid_ok',
        simulatorUsed: true,
      }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { registered: true } })
    expect(db.runs).toHaveLength(1)
    expect(db.runs[0].query).toContain('INSERT INTO waitlist_entries')
    expect(db.runs[0].query).toContain('ON CONFLICT(email) DO NOTHING')
    expect(db.runs[0].values).toEqual([
      'waitlist-uuid-1',
      'couple@example.com',
      'paid_ok',
      1,
      '2026-07-05T00:00:00.000Z',
    ])
  })

  it('メール形式が不正なら400を返す', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({ email: 'not-an-email', priceIntent: 'free_only', simulatorUsed: false }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(400)
    expect(db.runs).toHaveLength(0)
  })

  it('価格意向が不正なら400を返す', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({ email: 'a@example.com', priceIntent: 'maybe', simulatorUsed: false }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(400)
    expect(db.runs).toHaveLength(0)
  })

  it('honeypotに値があれば成功を装い保存しない', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      waitlistRequest({
        email: 'bot@example.com',
        priceIntent: 'free_only',
        simulatorUsed: false,
        website: 'https://spam.example.com',
      }),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { registered: true } })
    expect(db.runs).toHaveLength(0)
  })

  it('waitlist以外のルートは引き続き認証必須', async () => {
    const db = new FakeWaitlistDb()
    const response = await handleRequest(
      new Request('https://worker.local/incomes?month=202607'),
      createEnv(db),
      deps
    )

    expect(response.status).toBe(401)
  })
})
