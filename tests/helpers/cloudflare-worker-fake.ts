import { createHouseholdDataSqlite } from './household-data-sqlite'
import { createRecordsSqlite } from './records-sqlite'
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
  household_id?: string
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
  private diagnosisRows: FakeDiagnosisRow[] = []
  private sourceRevision = 0

  get currentSourceRevision(): number {
    return this.sourceRevision
  }
  readonly recordSqlite = createRecordsSqlite()
  readonly aiSqlite = createHouseholdDataSqlite()

  constructor(rows: {
    incomes?: FakeIncomeRow[]
    expenses?: FakeExpenseRow[]
    carryovers?: FakeCarryoverRow[]
    loginAttempts?: FakeLoginAttemptRow[]
    diagnoses?: FakeDiagnosisRow[]
    sourceRevision?: number
  } = {}) {
    this.incomeRows = rows.incomes ?? this.incomeRows
    this.expenseRows = rows.expenses ?? this.expenseRows
    this.carryoverRows = rows.carryovers ?? this.carryoverRows
    this.loginAttemptRows = rows.loginAttempts ?? this.loginAttemptRows
    this.diagnosisRows = rows.diagnoses ?? this.diagnosisRows
    this.sourceRevision = rows.sourceRevision ?? this.sourceRevision
    this.recordSqlite.sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('a'.repeat(64),null,'password','2099-01-01','2026-01-01','A')
    this.syncRecordsToSqlite()
    this.aiSqlite.sqlite.exec("INSERT INTO households(id,created_at) VALUES('A','now'); INSERT INTO ai_execution_guard(household_id,id,usage_date,daily_count,updated_at) VALUES('A',1,'1970-01-01',0,'now'); INSERT INTO ai_diagnosis_source_revision(household_id,id,revision,updated_at) VALUES('A',1,0,'now');")
    for (const row of this.diagnosisRows) {
      this.aiSqlite.sqlite.prepare('INSERT INTO ai_diagnoses(household_id,id,month,result_json,input_hash,analysis_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('A',crypto.randomUUID(),row.month,row.result_json,row.input_hash,row.analysis_version,row.updated_at,row.updated_at)
    }
  }

  private usesAiSqlite(query: string) {
    return query.includes('ai_diagnos') || query.includes('ai_execution') || query.startsWith('WITH requested') || /SELECT (month, amount|id, month, label, amount, is_carryover, ai_category)/.test(query)
  }
  private syncAiInputs() {
    for (const [table, rows] of [['incomes', this.incomeRows], ['expenses', this.expenseRows], ['carryovers', this.carryoverRows]] as const) {
      this.aiSqlite.sqlite.exec(`DELETE FROM ${table}`)
      for (const row of rows) {
        const record = { ...row, household_id: row.household_id ?? 'A' }
        const columns = new Set(this.aiSqlite.sqlite.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name))
        const keys = Object.keys(record).filter(key => columns.has(key))
        this.aiSqlite.sqlite.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(key => (record as Record<string, string | number | null>)[key]))
      }
    }
    this.aiSqlite.sqlite.prepare("UPDATE ai_diagnosis_source_revision SET revision=? WHERE household_id='A'").run(this.sourceRevision)
  }


  private syncRecordsToSqlite() {
    for (const [table,rows] of [['incomes',this.incomeRows],['expenses',this.expenseRows],['carryovers',this.carryoverRows]] as const) {
      this.recordSqlite.sqlite.exec(`DELETE FROM ${table}`)
      for (const row of rows) {
        const record = {...row,household_id:row.household_id ?? 'A'}
        const keys = Object.keys(record)
        this.recordSqlite.sqlite.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(record))
      }
    }
  }
  private syncRecordsFromSqlite() {
    this.incomeRows = this.recordSqlite.sqlite.prepare('SELECT * FROM incomes').all() as FakeIncomeRow[]
    this.expenseRows = this.recordSqlite.sqlite.prepare('SELECT * FROM expenses').all() as FakeExpenseRow[]
    this.carryoverRows = this.recordSqlite.sqlite.prepare('SELECT * FROM carryovers').all() as FakeCarryoverRow[]
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
    if (batch.some(item => this.usesAiSqlite(item.query))) {
      this.syncAiInputs()
      this.executed.push(...batch)
      return this.aiSqlite.db.batch(batch.map(item => this.aiSqlite.db.prepare(item.query).bind(...item.params)))
    }
    if (batch[0]?.query.startsWith('WITH selected')) {
      this.syncRecordsToSqlite()
      this.executed.push(...batch)
      const results = await this.recordSqlite.db.batch(batch.map(item => this.recordSqlite.db.prepare(item.query).bind(...item.params)))
      this.syncRecordsFromSqlite()
      this.sourceRevision += results.reduce((sum,row)=>sum+(row.meta?.changes ?? 0),0)
      return results
    }
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
    if (this.usesAiSqlite(query)) {
      this.syncAiInputs()
      const result = await this.aiSqlite.db.prepare(query).bind(...params).first<T>()
      return result
    }
    if (query.includes('household_id') && !query.includes('ai_diagnos') && !query.includes('ai_execution')) {
      this.syncRecordsToSqlite()
      const result = await this.recordSqlite.db.prepare(query).bind(...params).first<T>()
      return result
    }

    if (query.includes('FROM incomes')) {
      return (this.incomeRows.find((row) => row.id === params[0]) ?? null) as T | null
    }
    if (query.includes('FROM login_attempts')) {
      return (
        this.loginAttemptRows.find((row) => row.attempt_key === params[0]) ?? null
      ) as T | null
    }

    return null
  }

  async all<T>(query: string, params: unknown[]): Promise<{ results: T[] }> {
    this.executed.push({ query, params })
    if (this.usesAiSqlite(query)) {
      this.syncAiInputs()
      const result = await this.aiSqlite.db.prepare(query).bind(...params).all<T>()
      if (query.startsWith('WITH requested')) this.expenseRows = this.aiSqlite.sqlite.prepare('SELECT * FROM expenses').all() as FakeExpenseRow[]
      return result
    }
    if (query.includes('household_id') && !query.includes('ai_diagnos') && !query.includes('ai_execution')) {
      this.syncRecordsToSqlite()
      const result = await this.recordSqlite.db.prepare(query).bind(...params).all<T>()
      return result
    }

    if (query.includes('FROM incomes') && query.includes('WHERE month = ?')) {
      return {
        results: this.incomeRows.filter((row) => row.month === params[0]) as T[],
      }
    }
    if (query.includes('FROM incomes')) {
      if (query.startsWith('SELECT month, amount FROM incomes')) {
        return {
          results: this.incomeRows.filter((row) => params.includes(row.month))
            .map(({ month, amount }) => ({ month, amount })) as T[],
        }
      }
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
    return { results: [] }
  }

  async run(query: string, params: unknown[]): Promise<D1ResultLike> {
    this.executed.push({ query, params })
    if (this.usesAiSqlite(query)) {
      this.syncAiInputs()
      const result = await this.aiSqlite.db.prepare(query).bind(...params).run()
      return result
    }
    if (query.includes('household_id') && !query.includes('ai_diagnos') && !query.includes('ai_execution')) {
      this.syncRecordsToSqlite()
      const result = await this.recordSqlite.db.prepare(query).bind(...params).run()
      this.syncRecordsFromSqlite()
      this.sourceRevision += result.meta?.changes ?? 0
      return result
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
    if (query.startsWith('INSERT INTO expenses')) {
      this.expenseRows.push({
        id: params[0] as string,
        month: params[1] as string,
        label: params[2] as string,
        amount: params[3] as number,
        person: params[4] as 'husband' | 'wife',
        is_carryover: params[5] as number,
        created_at: params[6] as string,
        updated_at: params[7] as string,
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
  const headers = new Headers(init.headers)
  if (path.startsWith('/ai-diagnoses') && !headers.has('x-household-session')) headers.set('x-household-session', 'a'.repeat(64))
  return new Request(`https://api.example.test${path}`, { ...init, headers })
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
