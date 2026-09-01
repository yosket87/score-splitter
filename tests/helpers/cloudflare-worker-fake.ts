import { expect, vi } from 'vitest'
import { handleRequest } from '../../cloudflare/worker/src/index'
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from '../../cloudflare/worker/src/d1'

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

export type FakeExpenseRow = FakeIncomeRow & {
  is_carryover: number
  ai_category?: string | null
  ai_category_source?: string | null
  ai_categorized_at?: string | null
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

export class FakeD1Database implements D1DatabaseLike {
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
  private sourceRevision = 0

  get currentSourceRevision(): number {
    return this.sourceRevision
  }
  private diagnosisLeases = new Map<string, { runToken: string; expiresAt: string }>()
  private diagnosisGuard: {
    runToken: string | null
    expiresAt: string | null
    lastStartedAt: string | null
    usageDate: string
    dailyCount: number
  } = {
    runToken: null,
    expiresAt: null,
    lastStartedAt: null,
    usageDate: '1970-01-01',
    dailyCount: 0,
  }

  constructor(rows: {
    incomes?: FakeIncomeRow[]
    expenses?: FakeExpenseRow[]
    carryovers?: FakeCarryoverRow[]
    loginAttempts?: FakeLoginAttemptRow[]
    sessions?: FakeSessionRow[]
    passkeys?: FakePasskeyRow[]
    challenges?: FakeChallengeRow[]
    diagnoses?: FakeDiagnosisRow[]
    sourceRevision?: number
  } = {}) {
    this.incomeRows = rows.incomes ?? this.incomeRows
    this.expenseRows = rows.expenses ?? this.expenseRows
    this.carryoverRows = rows.carryovers ?? this.carryoverRows
    this.loginAttemptRows = rows.loginAttempts ?? this.loginAttemptRows
    this.sessionRows = rows.sessions ?? this.sessionRows
    this.passkeyRows = rows.passkeys ?? this.passkeyRows
    this.challengeRows = rows.challenges ?? this.challengeRows
    this.diagnosisRows = rows.diagnoses ?? this.diagnosisRows
    this.sourceRevision = rows.sourceRevision ?? this.sourceRevision
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
      if (item.query.startsWith('SELECT')) {
        results.push({ success: true, ...(await this.all(item.query, item.params)) })
      } else {
        results.push(await this.run(item.query, item.params))
      }
    }
    return results
  }

  async first<T>(query: string, params: unknown[]): Promise<T | null> {
    this.executed.push({ query, params })
    if (query.includes('FROM ai_diagnosis_source_revision')) {
      return { revision: this.sourceRevision } as T
    }
    if (query.includes('FROM ai_execution_guard')) {
      return {
        run_token: this.diagnosisGuard.runToken,
        run_expires_at: this.diagnosisGuard.expiresAt,
        last_started_at: this.diagnosisGuard.lastStartedAt,
        usage_date: this.diagnosisGuard.usageDate,
        daily_count: this.diagnosisGuard.dailyCount,
      } as T
    }
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
    if (query.includes('FROM ai_diagnosis_source_revision')) {
      return { results: [{ revision: this.sourceRevision }] as T[] }
    }
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
    if (query.startsWith('UPDATE ai_execution_guard\nSET run_token = ?')) {
      const token = params[0] as string
      const expiresAt = params[1] as string
      const now = params[2] as string
      const usageDate = params[3] as string
      const cooldownCutoff = params[8] as string
      const dailyLimit = params[10] as number
      const month = params[11] as string
      const active =
        this.diagnosisGuard.runToken !== null &&
        this.diagnosisGuard.expiresAt !== null &&
        this.diagnosisGuard.expiresAt >= now
      const coolingDown =
        this.diagnosisGuard.lastStartedAt !== null &&
        this.diagnosisGuard.lastStartedAt > cooldownCutoff
      const dailyLimited =
        this.diagnosisGuard.usageDate === usageDate &&
        this.diagnosisGuard.dailyCount >= dailyLimit
      const monthLease = this.diagnosisLeases.get(month)
      const monthBusy = monthLease !== undefined && monthLease.expiresAt >= now
      if (active || coolingDown || dailyLimited || monthBusy) {
        return { success: true, meta: { changes: 0 } }
      }
      this.diagnosisGuard = {
        runToken: token,
        expiresAt,
        lastStartedAt: now,
        usageDate,
        dailyCount:
          this.diagnosisGuard.usageDate === usageDate
            ? this.diagnosisGuard.dailyCount + 1
            : 1,
      }
      return { success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE ai_execution_guard\nSET run_token = NULL')) {
      const token = params[1] as string
      if (this.diagnosisGuard.runToken !== token) {
        return { success: true, meta: { changes: 0 } }
      }
      this.diagnosisGuard = {
        ...this.diagnosisGuard,
        runToken: null,
        expiresAt: null,
      }
      return { success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE ai_diagnoses\nSET result_json')) {
      const month = params[4] as string
      const runToken = params[5] as string
      const now = params[6] as string
      const current = this.diagnosisLeases.get(month)
      const expectedSourceRevision = params[11] as number
      if (
        !current ||
        current.runToken !== runToken ||
        current.expiresAt < now ||
        this.diagnosisGuard.runToken !== runToken ||
        this.diagnosisGuard.expiresAt === null ||
        this.diagnosisGuard.expiresAt < now ||
        this.sourceRevision !== expectedSourceRevision
      ) {
        return { success: true, meta: { changes: 0 } }
      }
      this.diagnosisLeases.delete(month)
      this.diagnosisGuard = {
        ...this.diagnosisGuard,
        runToken: null,
        expiresAt: null,
      }
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
      if (this.diagnosisGuard.runToken === runToken) {
        this.diagnosisGuard = {
          ...this.diagnosisGuard,
          runToken: null,
          expiresAt: null,
        }
      }
      return { success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE ai_diagnoses\nSET run_token = ?, run_expires_at = ?')) {
      const month = params[3] as string
      const now = params[4] as string
      const current = this.diagnosisLeases.get(month)
      if (current && current.expiresAt >= now) {
        return { success: true, meta: { changes: 0 } }
      }
      if (
        this.diagnosisGuard.runToken !== params[6] ||
        this.diagnosisGuard.expiresAt !== params[7]
      ) {
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
      return {
        success: true,
        meta: { changes: this.diagnosisRows.some((row) => row.month === month) ? 0 : 1 },
      }
    }
    if (query.startsWith('WITH requested AS')) {
      const requested = JSON.parse(params[0] as string) as Array<{
        expenseId: string
        category: string
        expectedLabel: string
      }>
      const month = params[2] as string
      const runToken = params[3] as string
      const now = params[4] as string
      const monthLease = this.diagnosisLeases.get(month)
      const ownsRun =
        monthLease?.runToken === runToken &&
        monthLease.expiresAt >= now &&
        this.diagnosisGuard.runToken === runToken &&
        this.diagnosisGuard.expiresAt !== null &&
        this.diagnosisGuard.expiresAt >= now
      const eligible = requested.every(({ expenseId, expectedLabel }) =>
        this.expenseRows.some(
          (row) =>
            row.id === expenseId &&
            row.label === expectedLabel &&
            row.ai_category == null
        )
      )
      if (!ownsRun || !eligible) {
        return { success: true, meta: { changes: 0 } }
      }
      const categoriesById = new Map(
        requested.map(({ expenseId, category }) => [expenseId, category])
      )
      this.expenseRows = this.expenseRows.map((row) => {
        const category = categoriesById.get(row.id)
        return category === undefined
          ? row
          : {
              ...row,
              ai_category: category,
              ai_category_source: 'ai',
              ai_categorized_at: params[6] as string,
              updated_at: params[7] as string,
            }
      })
      return { success: true, meta: { changes: requested.length } }
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
    if (
      /^(INSERT INTO|DELETE FROM) (incomes|expenses|carryovers)/.test(query) ||
      (/^UPDATE (incomes|expenses|carryovers)\s+SET/.test(query) &&
        !query.startsWith('UPDATE expenses\nSET ai_category'))
    ) {
      this.sourceRevision += 1
    }
    return { success: true, meta: { changes: 1 } }
  }
}

export function createRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://api.example.test${path}`, init)
}

export function createEnv(db = new FakeD1Database()) {
  return {
    DB: db,
    WORKER_API_TOKEN: 'secret-token',
  }
}

export const diagnosisView = {
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

export async function acquireLeaseForTest(db: FakeD1Database, runToken = 'run-1'): Promise<void> {
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
