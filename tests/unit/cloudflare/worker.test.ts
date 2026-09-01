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

type FakeDiagnosisRow = {
  month: string
  result_json: string | null
  input_hash: string | null
  analysis_version: string | null
  updated_at: string
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
  private diagnosisRows: FakeDiagnosisRow[] = []
  private diagnosisLeases = new Map<string, { runToken: string; expiresAt: string }>()

  constructor(rows: {
    incomes?: FakeIncomeRow[]
    expenses?: FakeExpenseRow[]
    carryovers?: FakeCarryoverRow[]
    loginAttempts?: FakeLoginAttemptRow[]
    sessions?: FakeSessionRow[]
    passkeys?: FakePasskeyRow[]
    challenges?: FakeChallengeRow[]
    diagnoses?: FakeDiagnosisRow[]
  } = {}) {
    this.incomeRows = rows.incomes ?? this.incomeRows
    this.expenseRows = rows.expenses ?? this.expenseRows
    this.carryoverRows = rows.carryovers ?? this.carryoverRows
    this.loginAttemptRows = rows.loginAttempts ?? this.loginAttemptRows
    this.sessionRows = rows.sessions ?? this.sessionRows
    this.passkeyRows = rows.passkeys ?? this.passkeyRows
    this.challengeRows = rows.challenges ?? this.challengeRows
    this.diagnosisRows = rows.diagnoses ?? this.diagnosisRows
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
    const results: D1ResultLike[] = []
    for (const item of batch) {
      results.push(await this.run(item.query, item.params))
    }
    return results
  }

  async first<T>(query: string, params: unknown[]): Promise<T | null> {
    this.executed.push({ query, params })
    if (query.includes('FROM ai_diagnoses')) {
      return (
        this.diagnosisRows.find((row) => row.month === params[0]) ?? null
      ) as T | null
    }
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
    if (query.startsWith('UPDATE ai_diagnoses\nSET result_json')) {
      const month = params.at(-2) as string
      const runToken = params.at(-1) as string
      const current = this.diagnosisLeases.get(month)
      if (!current || current.runToken !== runToken) {
        return { success: true, meta: { changes: 0 } }
      }
      this.diagnosisLeases.delete(month)
      return { success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE ai_diagnoses\nSET run_token = NULL')) {
      const month = params[0] as string
      const runToken = params[1] as string
      const current = this.diagnosisLeases.get(month)
      if (!current || current.runToken !== runToken) {
        return { success: true, meta: { changes: 0 } }
      }
      this.diagnosisLeases.delete(month)
      return { success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE ai_diagnoses\nSET run_token = ?, run_expires_at = ?')) {
      const month = params[3] as string
      const now = params[4] as string
      const current = this.diagnosisLeases.get(month)
      if (current && current.expiresAt >= now) {
        return { success: true, meta: { changes: 0 } }
      }
      if (!current) {
        return { success: true, meta: { changes: 0 } }
      }
      this.diagnosisLeases.set(month, {
        runToken: params[0] as string,
        expiresAt: params[1] as string,
      })
      return { success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('INSERT OR IGNORE INTO ai_diagnoses')) {
      const month = params[1] as string
      if (this.diagnosisLeases.has(month)) {
        return { success: true, meta: { changes: 0 } }
      }
      this.diagnosisLeases.set(month, {
        runToken: params[2] as string,
        expiresAt: params[3] as string,
      })
      return { success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE expenses\nSET ai_category')) {
      const expectedLabel = params.at(-1) as string
      const expenseIds = params.slice(3, -1) as string[]
      const changes = expenseIds.filter((expenseId) =>
        this.expenseRows.some((row) => row.id === expenseId && row.label === expectedLabel)
      ).length
      return { success: true, meta: { changes } }
    }
    if (query.startsWith('INSERT INTO incomes')) {
      this.incomeRows.push({
        id: params[0] as string,
        month: params[1] as string,
        label: params[2] as string,
        amount: params[3] as number,
        person: params[4] as 'husband' | 'wife',
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

const diagnosisView = {
  month: '202601',
  summaryText: '今月の家計は安定しています',
  currentExpenseTotal: 120000,
  baselineExpenseAverage: 115000,
  unresolvedCarryoverTotal: 10000,
  notableChanges: [],
  positivePoints: [],
  suggestions: [],
  dataSufficiency: 'full',
} as const

async function acquireLeaseForTest(db: FakeD1Database, runToken = 'run-1'): Promise<void> {
  const response = await handleRequest(
    createRequest('/ai-diagnoses/202601/lease', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ runToken }),
    }),
    createEnv(db),
    {
      randomUUID: vi.fn(() => 'diagnosis-id'),
      now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')),
    }
  )
  expect(response.status).toBe(200)
  db.executed.length = 0
}

describe('Cloudflare Worker API', () => {
  it('共有シークレットがないリクエストを拒否する', async () => {
    const response = await handleRequest(createRequest('/incomes?month=202601'), createEnv())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: '認証に失敗しました',
    })
  })

  it('診断コンテキストを担当者なしで返す', async () => {
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601/context', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    expect(response.status).toBe(200)
    const payload = await response.json() as { data: { expenses: unknown[] } }
    expect(payload.data.expenses[0]).toEqual({
      id: 'expense-1',
      month: '202601',
      label: '家賃',
      amount: -120000,
      isCarryover: false,
      aiCategory: null,
    })
    expect(payload.data.expenses[0]).not.toHaveProperty('person')
  })

  it('保存済み診断がない月はnullを返す', async () => {
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: null })
  })

  it('strict検証済みの保存済み診断を返す', async () => {
    const db = new FakeD1Database({
      diagnoses: [
        {
          month: '202601',
          result_json: JSON.stringify(diagnosisView),
          input_hash: 'hash-1',
          analysis_version: 'v1',
          updated_at: '2026-01-20T12:00:00.000Z',
        },
      ],
    })
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        diagnosis: diagnosisView,
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        updatedAt: '2026-01-20T12:00:00.000Z',
      },
    })
  })

  it('保存済み診断もstrict検証しpersonをAPIへ露出しない', async () => {
    const db = new FakeD1Database({
      diagnoses: [
        {
          month: '202601',
          result_json: JSON.stringify({ ...diagnosisView, person: 'husband' }),
          input_hash: 'hash-1',
          analysis_version: 'v1',
          updated_at: '2026-01-20T12:00:00.000Z',
        },
      ],
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    consoleError.mockRestore()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: '内部エラーが発生しました' })
  })

  it('有効な実行リースがある場合は409を返す', async () => {
    const db = new FakeD1Database()
    const requestLease = (runToken: string) =>
      handleRequest(
        createRequest('/ai-diagnoses/202601/lease', {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ runToken }),
        }),
        createEnv(db),
        {
          randomUUID: vi.fn(() => 'diagnosis-id'),
          now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')),
        }
      )

    const first = await requestLease('first-run')
    const second = await requestLease('second-run')

    expect(first.status).toBe(200)
    await expect(first.json()).resolves.toEqual({ success: true })
    expect(second.status).toBe(409)
    await expect(second.json()).resolves.toEqual({ error: '診断を実行中です' })
  })

  it('支出カテゴリを期待ラベルとの楽観ロック付きで保存する', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          assignments: [
            { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '家賃' },
          ],
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(db.batched[0][0].params).toEqual([
      'housing',
      '2026-01-20T12:00:00.000Z',
      '2026-01-20T12:00:00.000Z',
      'expense-1',
      '家賃',
    ])
  })

  it('支出カテゴリ分類101件をWorker境界で400にしbatchを実行しない', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          assignments: [
            {
              expenseIds: Array.from({ length: 60 }, (_, index) => `expense-${index}`),
              category: 'housing',
              expectedLabel: '家賃',
            },
            {
              expenseIds: Array.from({ length: 41 }, (_, index) => `expense-${index + 60}`),
              category: 'housing',
              expectedLabel: '家賃',
            },
          ],
        }),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: '一度に分類できる支出は100件までです',
    })
    expect(db.batched).toHaveLength(0)
  })

  it('支出カテゴリ分類100件をWorker境界で受理する', async () => {
    const expenses = Array.from({ length: 100 }, (_, index): FakeExpenseRow => ({
      id: `expense-${index}`,
      month: '202601',
      label: '家賃',
      amount: -1000,
      person: index % 2 === 0 ? 'husband' : 'wife',
      is_carryover: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }))
    const db = new FakeD1Database({ expenses })
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          assignments: [
            {
              expenseIds: expenses.slice(0, 60).map(({ id }) => id),
              category: 'housing',
              expectedLabel: '家賃',
            },
            {
              expenseIds: expenses.slice(60).map(({ id }) => id),
              category: 'housing',
              expectedLabel: '家賃',
            },
          ],
        }),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(200)
    expect(db.batched).toHaveLength(1)
  })

  it('runTokenが一致する診断を保存し、成功後にリース解放を重ねない', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          runToken: 'run-1',
          inputHash: 'hash-1',
          analysisVersion: 'v1',
          diagnosis: diagnosisView,
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: diagnosisView })
    const diagnosisUpdates = db.executed.filter(({ query }) =>
      query.startsWith('UPDATE ai_diagnoses')
    )
    expect(diagnosisUpdates).toHaveLength(1)
    expect(diagnosisUpdates[0].params.slice(-2)).toEqual(['202601', 'run-1'])
  })

  it('失敗経路で所有中の診断リースを解放する', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601/lease', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ runToken: 'run-1' }),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(db.executed.at(-1)).toEqual({
      query: `UPDATE ai_diagnoses
SET run_token = NULL, run_expires_at = NULL
WHERE month = ? AND run_token = ?`,
      params: ['202601', 'run-1'],
    })
  })

  it('分類対象のラベルが変わっていた場合は409を返す', async () => {
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          assignments: [
            { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '旧家賃' },
          ],
        }),
      }),
      createEnv()
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: '分類中に支出が変更されました',
    })
  })

  it.each([
    [
      'expectedLabel欠落',
      '/ai-diagnoses/categories',
      'PATCH',
      { assignments: [{ expenseIds: ['expense-1'], category: 'housing' }] },
    ],
    [
      'person混入',
      '/ai-diagnoses/202601',
      'PUT',
      {
        runToken: 'run-1',
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        diagnosis: { ...diagnosisView, person: 'husband' },
      },
    ],
    [
      'リースbodyの未知キー',
      '/ai-diagnoses/202601/lease',
      'POST',
      { runToken: 'run-1', person: 'husband' },
    ],
  ])('%sをstrict body検証で400にする', async (_name, path, method, body) => {
    const response = await handleRequest(
      createRequest(path, {
        method,
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
  })

  it.each([
    ['保存', '/ai-diagnoses/202601', 'PUT', {
      runToken: 'missing-run',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: diagnosisView,
    }],
    ['解放', '/ai-diagnoses/202601/lease', 'DELETE', { runToken: 'missing-run' }],
  ])('失効リースの%sを409にする', async (_name, path, method, body) => {
    const response = await handleRequest(
      createRequest(path, {
        method,
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      createEnv()
    )

    expect(response.status).toBe(409)
  })

  it('診断APIでもBearer認証と月形式を検証する', async () => {
    const unauthorized = await handleRequest(
      createRequest('/ai-diagnoses/202601/context'),
      createEnv()
    )
    const invalidMonth = await handleRequest(
      createRequest('/ai-diagnoses/2026-01/context', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    expect(unauthorized.status).toBe(401)
    expect(invalidMonth.status).toBe(400)
  })

  it.each([
    ['context', '202600', 'GET', '/ai-diagnoses/202600/context', undefined],
    ['context', '202613', 'GET', '/ai-diagnoses/202613/context', undefined],
    ['lease', '202600', 'POST', '/ai-diagnoses/202600/lease', { runToken: 'run-1' }],
    ['lease', '202613', 'POST', '/ai-diagnoses/202613/lease', { runToken: 'run-1' }],
    ['save', '202600', 'PUT', '/ai-diagnoses/202600', {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: { ...diagnosisView, month: '202600' },
    }],
    ['save', '202613', 'PUT', '/ai-diagnoses/202613', {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: { ...diagnosisView, month: '202613' },
    }],
  ])('実在しない月の%s(%s)をDB操作前に400で拒否する', async (
    _route,
    _month,
    method,
    path,
    body
  ) => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest(path, {
        method,
        headers: {
          authorization: 'Bearer secret-token',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(400)
    expect(db.executed).toHaveLength(0)
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

  it('通常レコードAPIでも実在しない月をDB操作前に400で拒否する', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest('/incomes?month=202600', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    expect(response.status).toBe(400)
    expect(db.executed).toHaveLength(0)
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

  it.each([
    ['token', { token: 'invalid' }, 'tokenが不正です'],
    ['person', { person: 'partner' }, 'personが不正です'],
    ['authMethod', { authMethod: 'magic-link' }, 'authMethodが不正です'],
    ['expiresAt', { expiresAt: 'invalid-date' }, 'expiresAtが不正です'],
  ])('セッションの%sが不正なら400を返す', async (_name, override, error) => {
    const response = await handleRequest(
      createRequest('/sessions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token: 'a'.repeat(64),
          person: 'wife',
          authMethod: 'passkey',
          expiresAt: '2026-02-10T04:05:06.000Z',
          ...override,
        }),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error })
  })

  it.each([
    ['type', { type: 'invalid' }, 'typeが不正です'],
    ['expiresAt', { expiresAt: 'invalid-date' }, 'expiresAtが不正です'],
  ])('WebAuthnチャレンジの%sが不正なら400を返す', async (_name, override, error) => {
    const response = await handleRequest(
      createRequest('/webauthn-challenges', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          challenge: 'challenge',
          type: 'registration',
          person: 'husband',
          expiresAt: '2026-02-10T04:05:06.000Z',
          ...override,
        }),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error })
  })

  it.each([
    ['mode', { mode: 'invalid' }],
    ['selectedItems', { selectedItems: null }],
  ])('月コピーの%sが不正なら400を返す', async (_name, override) => {
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
          includeCarryover: false,
          selectedItems: [],
          ...override,
        }),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: `${_name}が不正です` })
  })

  it.each([
    ['income', -1],
    ['expense', 1],
  ] as const)('月コピーの%sに不正な符号の金額を指定すると400を返す', async (type, amount) => {
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
          includeCarryover: false,
          selectedItems: [
            {
              id: `${type}-1`,
              label: '不正金額',
              amount,
              person: 'husband',
              type,
              itemCopyMode: 'withAmount',
            },
          ],
        }),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'amountが不正です' })
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

  it('addモードはコピー先と重複する繰越だけをスキップして他項目をコピーする', async () => {
    const db = new FakeD1Database({
      carryovers: [
        {
          id: 'source-duplicate',
          month: '202601',
          label: '重複繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z',
        },
        {
          id: 'source-unique',
          month: '202601',
          label: '新規繰越',
          amount: -20000,
          person: 'wife',
          is_cleared: 0,
          created_at: '2026-01-04T00:00:00.000Z',
          updated_at: '2026-01-04T00:00:00.000Z',
        },
        {
          id: 'target-duplicate',
          month: '202602',
          label: '重複繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-01T00:00:00.000Z',
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
          selectedItems: [
            {
              id: 'income-1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
            {
              id: 'expense-1',
              label: '家賃',
              amount: -120000,
              person: 'wife',
              type: 'expense',
              itemCopyMode: 'withAmount',
            },
          ],
        }),
      }),
      createEnv(db),
      {
        randomUUID: vi.fn()
          .mockReturnValueOnce('copied-income-id')
          .mockReturnValueOnce('copied-expense-id')
          .mockReturnValueOnce('copied-carryover-id'),
        now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')),
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      copied: { incomes: 1, expenses: 1, carryovers: 1 },
      skipped: { incomes: 0, expenses: 0, carryovers: 1 },
    })
    const carryoverInserts = db.batched[0].filter((item) =>
      item.query.startsWith('INSERT INTO carryovers')
    )
    expect(carryoverInserts).toHaveLength(1)
    expect(carryoverInserts[0].params).toContain('新規繰越')
  })

  it.each(['skip', 'replace'] as const)(
    '%sモードの既存繰越処理を維持する',
    async (mode) => {
      const db = new FakeD1Database({
        carryovers: [
          {
            id: 'source-carryover',
            month: '202601',
            label: '前月繰越',
            amount: -10000,
            person: 'husband',
            is_cleared: 0,
            created_at: '2026-01-03T00:00:00.000Z',
            updated_at: '2026-01-03T00:00:00.000Z',
          },
          {
            id: 'target-carryover',
            month: '202602',
            label: '前月繰越',
            amount: -10000,
            person: 'husband',
            is_cleared: 0,
            created_at: '2026-02-01T00:00:00.000Z',
            updated_at: '2026-02-01T00:00:00.000Z',
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
            mode,
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

      await expect(response.json()).resolves.toMatchObject(
        mode === 'skip'
          ? {
              copied: { carryovers: 0 },
              skipped: { carryovers: 1 },
            }
          : {
              copied: { carryovers: 1 },
              skipped: { carryovers: 0 },
            }
      )
      if (mode === 'replace') {
        expect(db.batched[0].map((item) => item.query)).toEqual([
          'DELETE FROM carryovers WHERE month = ?',
          expect.stringContaining('INSERT INTO carryovers'),
        ])
      }
    }
  )

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
