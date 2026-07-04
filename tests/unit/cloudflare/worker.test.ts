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

type FakeIncomeRow = {
  id: string
  month: string
  label: string
  amount: number
  person: 'husband' | 'wife'
  created_at: string
  updated_at: string
}

type FakeExpenseRow = FakeIncomeRow & {
  is_carryover: number
}

type FakeCarryoverRow = FakeIncomeRow & {
  is_cleared: number
}

type FakeLoginAttemptRow = {
  attempt_key: string
  count: number
  window_start: string
  updated_at: string
}

type FakeSessionRow = {
  token: string
  person: 'husband' | 'wife' | null
  auth_method: 'password' | 'passkey'
  expires_at: string
  created_at: string
}

type FakePasskeyRow = {
  id: string
  person: 'husband' | 'wife'
  public_key_base64: string
  counter: number
  device_name: string | null
  transports: string
  created_at: string
}

type FakeChallengeRow = {
  id: string
  challenge: string
  type: 'registration' | 'authentication'
  person: 'husband' | 'wife' | null
  expires_at: string
  created_at: string
}

class FakeD1Database implements D1DatabaseLike {
  readonly executed: Array<{ query: string; params: unknown[] }> = []
  readonly batched: Array<Array<{ query: string; params: unknown[] }>> = []
  private incomeRows: FakeIncomeRow[] = [
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
  private expenseRows: FakeExpenseRow[] = [
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
  private carryoverRows: FakeCarryoverRow[] = [
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
  private loginAttemptRows: FakeLoginAttemptRow[] = []
  private sessionRows: FakeSessionRow[] = []
  private passkeyRows: FakePasskeyRow[] = [
    {
      id: 'credential-1',
      person: 'husband',
      public_key_base64: 'AQID',
      counter: 0,
      device_name: 'iPhone',
      transports: '["internal"]',
      created_at: '2026-01-04T00:00:00.000Z',
    },
  ]
  private challengeRows: FakeChallengeRow[] = []

  constructor(rows: {
    incomes?: FakeIncomeRow[]
    expenses?: FakeExpenseRow[]
    carryovers?: FakeCarryoverRow[]
    loginAttempts?: FakeLoginAttemptRow[]
    sessions?: FakeSessionRow[]
    passkeys?: FakePasskeyRow[]
    challenges?: FakeChallengeRow[]
  } = {}) {
    this.incomeRows = rows.incomes ?? this.incomeRows
    this.expenseRows = rows.expenses ?? this.expenseRows
    this.carryoverRows = rows.carryovers ?? this.carryoverRows
    this.loginAttemptRows = rows.loginAttempts ?? this.loginAttemptRows
    this.sessionRows = rows.sessions ?? this.sessionRows
    this.passkeyRows = rows.passkeys ?? this.passkeyRows
    this.challengeRows = rows.challenges ?? this.challengeRows
  }

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
    if (query.includes('FROM login_attempts')) {
      return (
        this.loginAttemptRows.find((row) => row.attempt_key === params[0]) ?? null
      ) as T | null
    }
    if (query.includes('FROM sessions')) {
      return (
        this.sessionRows.find((row) => row.token === params[0]) ?? null
      ) as T | null
    }
    if (query.includes('FROM passkey_credentials')) {
      return (
        this.passkeyRows.find((row) => row.id === params[0]) ?? null
      ) as T | null
    }
    if (query.includes('FROM webauthn_challenges')) {
      const type = params[0] as 'registration' | 'authentication'
      const person = query.includes('person IS NULL')
        ? null
        : (params[1] as 'husband' | 'wife')
      const rows = this.challengeRows
        .filter((row) => row.type === type && row.person === person)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      return (rows[0] ?? null) as T | null
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
      let rows = this.expenseRows
      if (query.includes('WHERE month = ?')) {
        rows = rows.filter((row) => row.month === params[0])
      }
      if (query.includes('is_carryover = 1')) {
        rows = rows.filter((row) => row.is_carryover === 1)
      }
      return { results: rows as T[] }
    }
    if (query.includes('FROM carryovers')) {
      const rows = query.includes('WHERE month = ?')
        ? this.carryoverRows.filter((row) => row.month === params[0])
        : this.carryoverRows
      return { results: rows as T[] }
    }
    if (query.includes('FROM passkey_credentials')) {
      const rows = query.includes('WHERE person = ?')
        ? this.passkeyRows.filter((row) => row.person === params[0])
        : this.passkeyRows
      return { results: rows as T[] }
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
    if (query.startsWith('INSERT INTO carryovers')) {
      this.carryoverRows.push({
        id: params[0] as string,
        month: params[1] as string,
        label: params[2] as string,
        amount: params[3] as number,
        person: params[4] as 'husband' | 'wife',
        is_cleared: params[5] as number,
        created_at: params[6] as string,
        updated_at: params[7] as string,
      })
    }
    if (query.startsWith('DELETE FROM incomes')) {
      this.incomeRows = this.incomeRows.filter((row) => row.month !== params[0])
    }
    if (query.startsWith('INSERT INTO login_attempts')) {
      this.loginAttemptRows.push({
        attempt_key: params[0] as string,
        count: params[1] as number,
        window_start: params[2] as string,
        updated_at: params[3] as string,
      })
    }
    if (query.startsWith('UPDATE login_attempts')) {
      this.loginAttemptRows = this.loginAttemptRows.map((row) =>
        row.attempt_key === params[3]
          ? {
              ...row,
              count: params[0] as number,
              window_start: params[1] as string,
              updated_at: params[2] as string,
            }
          : row
      )
    }
    if (query.startsWith('DELETE FROM login_attempts')) {
      this.loginAttemptRows = this.loginAttemptRows.filter(
        (row) => row.attempt_key !== params[0]
      )
    }
    if (query.startsWith('INSERT INTO sessions')) {
      this.sessionRows.push({
        token: params[0] as string,
        person: params[1] as 'husband' | 'wife' | null,
        auth_method: params[2] as 'password' | 'passkey',
        expires_at: params[3] as string,
        created_at: params[4] as string,
      })
    }
    if (query.startsWith('DELETE FROM sessions')) {
      this.sessionRows = this.sessionRows.filter((row) => row.token !== params[0])
    }
    if (query.startsWith('INSERT INTO passkey_credentials')) {
      this.passkeyRows.push({
        id: params[0] as string,
        person: params[1] as 'husband' | 'wife',
        public_key_base64: params[2] as string,
        counter: params[3] as number,
        device_name: params[4] as string | null,
        transports: params[5] as string,
        created_at: params[6] as string,
      })
    }
    if (query.startsWith('UPDATE passkey_credentials SET counter')) {
      this.passkeyRows = this.passkeyRows.map((row) =>
        row.id === params[1] ? { ...row, counter: params[0] as number } : row
      )
    }
    if (query.startsWith('DELETE FROM passkey_credentials')) {
      this.passkeyRows = this.passkeyRows.filter((row) => row.id !== params[0])
    }
    if (query.startsWith('INSERT INTO webauthn_challenges')) {
      this.challengeRows.push({
        id: params[0] as string,
        challenge: params[1] as string,
        type: params[2] as 'registration' | 'authentication',
        person: params[3] as 'husband' | 'wife' | null,
        expires_at: params[4] as string,
        created_at: params[5] as string,
      })
    }
    if (query.startsWith('DELETE FROM webauthn_challenges WHERE type')) {
      const type = params[0] as 'registration' | 'authentication'
      if (query.includes('person IS NULL')) {
        this.challengeRows = this.challengeRows.filter(
          (row) => !(row.type === type && row.person === null)
        )
      } else {
        this.challengeRows = this.challengeRows.filter(
          (row) => !(row.type === type && row.person === params[1])
        )
      }
    }
    if (query.startsWith('DELETE FROM webauthn_challenges WHERE expires_at')) {
      this.challengeRows = this.challengeRows.filter(
        (row) => row.expires_at >= (params[0] as string)
      )
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

  it('月コピー時に同一キーの繰越を1件へ重複排除する', async () => {
    const db = new FakeD1Database({
      carryovers: [
        {
          id: 'carryover-1',
          month: '202601',
          label: '前月繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z',
        },
        {
          id: 'carryover-2',
          month: '202601',
          label: '前月繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-01-04T00:00:00.000Z',
          updated_at: '2026-01-04T00:00:00.000Z',
        },
      ],
      expenses: [
        {
          id: 'expense-1',
          month: '202601',
          label: '前月繰越',
          amount: -10000,
          person: 'husband',
          is_carryover: 1,
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    })

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
          mode: 'add',
          includeCarryover: true,
          selectedItems: [],
        }),
      }),
      createEnv(db),
      {
        randomUUID: vi.fn(() => 'copied-carryover-id'),
        now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')),
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      copied: { incomes: 0, expenses: 0, carryovers: 1 },
      skipped: { incomes: 0, expenses: 0, carryovers: 2 },
    })
    expect(db.batched[0].map((item) => item.query)).toEqual([
      expect.stringContaining('INSERT INTO carryovers'),
    ])
  })

  it('ログイン失敗回数を記録して状態取得できる', async () => {
    const db = new FakeD1Database()
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const failureResponse = await handleRequest(
      createRequest('/login-attempts/failure', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'login-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(failureResponse.json()).resolves.toEqual({
      data: { allowed: true },
    })

    const checkResponse = await handleRequest(
      createRequest('/login-attempts/check', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'login-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(checkResponse.json()).resolves.toEqual({
      data: { allowed: true },
    })
    expect(
      db.executed.some((item) => item.query.startsWith('INSERT INTO login_attempts'))
    ).toBe(true)
  })

  it('ログイン失敗が上限に達したキーはロック状態を返す', async () => {
    const db = new FakeD1Database({
      loginAttempts: [
        {
          attempt_key: 'locked-key',
          count: 10,
          window_start: '2026-02-03T04:00:00.000Z',
          updated_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })

    const response = await handleRequest(
      createRequest('/login-attempts/check', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'locked-key' }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')) }
    )

    await expect(response.json()).resolves.toEqual({
      data: { allowed: false, retryAfterSeconds: 594 },
    })
  })

  it('ログイン成功時に失敗回数をリセットできる', async () => {
    const db = new FakeD1Database({
      loginAttempts: [
        {
          attempt_key: 'reset-key',
          count: 10,
          window_start: '2026-02-03T04:00:00.000Z',
          updated_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const resetResponse = await handleRequest(
      createRequest('/login-attempts/reset', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'reset-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(resetResponse.json()).resolves.toEqual({ success: true })

    const checkResponse = await handleRequest(
      createRequest('/login-attempts/check', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'reset-key' }),
      }),
      createEnv(db),
      { now }
    )

    await expect(checkResponse.json()).resolves.toEqual({
      data: { allowed: true },
    })
  })

  it('期限切れのログイン失敗windowは新しい失敗記録でリセットされる', async () => {
    const db = new FakeD1Database({
      loginAttempts: [
        {
          attempt_key: 'expired-key',
          count: 10,
          window_start: '2026-02-03T04:00:00.000Z',
          updated_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })

    const response = await handleRequest(
      createRequest('/login-attempts/failure', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ key: 'expired-key' }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-02-03T04:20:00.000Z')) }
    )

    await expect(response.json()).resolves.toEqual({
      data: { allowed: true },
    })
    expect(db.executed).toContainEqual({
      query:
        'UPDATE login_attempts SET count = ?, window_start = ?, updated_at = ? WHERE attempt_key = ?',
      params: [
        1,
        '2026-02-03T04:20:00.000Z',
        '2026-02-03T04:20:00.000Z',
        'expired-key',
      ],
    })
  })

  it('セッションを作成・取得・削除できる', async () => {
    const db = new FakeD1Database()
    const token = 'a'.repeat(64)
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const createResponse = await handleRequest(
      createRequest('/sessions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token,
          person: 'wife',
          authMethod: 'passkey',
          expiresAt: '2026-02-10T04:05:06.000Z',
        }),
      }),
      createEnv(db),
      { now }
    )

    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual({
      data: {
        token,
        person: 'wife',
        authMethod: 'passkey',
        expiresAt: '2026-02-10T04:05:06.000Z',
      },
    })

    const getResponse = await handleRequest(
      createRequest(`/sessions/${token}`, {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    await expect(getResponse.json()).resolves.toEqual({
      data: {
        token,
        person: 'wife',
        authMethod: 'passkey',
        expiresAt: '2026-02-10T04:05:06.000Z',
      },
    })

    const deleteResponse = await handleRequest(
      createRequest(`/sessions/${token}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    await expect(deleteResponse.json()).resolves.toEqual({ success: true })
    const afterDeleteResponse = await handleRequest(
      createRequest(`/sessions/${token}`, {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(afterDeleteResponse.json()).resolves.toEqual({ data: null })
  })

  it('パスキーを作成・一覧取得・カウンター更新・削除できる', async () => {
    const db = new FakeD1Database({ passkeys: [] })
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const createResponse = await handleRequest(
      createRequest('/passkeys', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'credential-new',
          person: 'husband',
          publicKeyBase64: 'AQID',
          counter: 0,
          deviceName: 'MacBook',
          transports: ['internal', 'hybrid'],
        }),
      }),
      createEnv(db),
      { now }
    )

    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual({
      data: {
        id: 'credential-new',
        person: 'husband',
        publicKeyBase64: 'AQID',
        counter: 0,
        deviceName: 'MacBook',
        transports: ['internal', 'hybrid'],
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })

    const listResponse = await handleRequest(
      createRequest('/passkeys?person=husband', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(listResponse.json()).resolves.toEqual({
      data: [
        {
          id: 'credential-new',
          person: 'husband',
          publicKeyBase64: 'AQID',
          counter: 0,
          deviceName: 'MacBook',
          transports: ['internal', 'hybrid'],
          createdAt: '2026-02-03T04:05:06.000Z',
        },
      ],
    })

    const patchResponse = await handleRequest(
      createRequest('/passkeys/credential-new', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ counter: 3 }),
      }),
      createEnv(db)
    )
    await expect(patchResponse.json()).resolves.toEqual({ success: true })

    const getResponse = await handleRequest(
      createRequest('/passkeys/credential-new', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(getResponse.json()).resolves.toMatchObject({
      data: { id: 'credential-new', counter: 3 },
    })

    const deleteResponse = await handleRequest(
      createRequest('/passkeys/credential-new', {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(deleteResponse.json()).resolves.toEqual({ success: true })
  })

  it('WebAuthnチャレンジを作成・最新取得・削除できる', async () => {
    const db = new FakeD1Database()
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))
    const randomUUID = vi.fn(() => 'challenge-id')

    const createResponse = await handleRequest(
      createRequest('/webauthn-challenges', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          challenge: 'registration-challenge',
          type: 'registration',
          person: 'husband',
          expiresAt: '2026-02-03T04:10:06.000Z',
        }),
      }),
      createEnv(db),
      { now, randomUUID }
    )

    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toEqual({
      data: {
        id: 'challenge-id',
        challenge: 'registration-challenge',
        type: 'registration',
        person: 'husband',
        expiresAt: '2026-02-03T04:10:06.000Z',
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })

    const latestResponse = await handleRequest(
      createRequest('/webauthn-challenges/latest?type=registration&person=husband', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(latestResponse.json()).resolves.toEqual({
      data: {
        id: 'challenge-id',
        challenge: 'registration-challenge',
        type: 'registration',
        person: 'husband',
        expiresAt: '2026-02-03T04:10:06.000Z',
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })

    const deleteResponse = await handleRequest(
      createRequest('/webauthn-challenges?type=registration&person=husband', {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(deleteResponse.json()).resolves.toEqual({ success: true })
  })

  it('期限切れWebAuthnチャレンジを削除できる', async () => {
    const db = new FakeD1Database({
      challenges: [
        {
          id: 'expired-challenge',
          challenge: 'expired',
          type: 'authentication',
          person: null,
          expires_at: '2026-02-03T04:00:00.000Z',
          created_at: '2026-02-03T03:55:00.000Z',
        },
        {
          id: 'active-challenge',
          challenge: 'active',
          type: 'authentication',
          person: null,
          expires_at: '2026-02-03T04:10:00.000Z',
          created_at: '2026-02-03T04:05:00.000Z',
        },
      ],
    })

    const deleteResponse = await handleRequest(
      createRequest('/webauthn-challenges/expired?before=2026-02-03T04:05:00.000Z', {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    await expect(deleteResponse.json()).resolves.toEqual({ success: true })

    const latestResponse = await handleRequest(
      createRequest('/webauthn-challenges/latest?type=authentication', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    await expect(latestResponse.json()).resolves.toMatchObject({
      data: { id: 'active-challenge', challenge: 'active' },
    })
  })
})
