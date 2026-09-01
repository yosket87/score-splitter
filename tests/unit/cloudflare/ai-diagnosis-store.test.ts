import { describe, expect, it } from 'vitest'
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  Runtime,
} from '../../../cloudflare/worker/src/d1'
import {
  acquireDiagnosisLease,
  getDiagnosisContext,
  getSavedDiagnosis,
  releaseDiagnosisLease,
  saveDiagnosis,
  saveExpenseCategories,
} from '../../../cloudflare/worker/src/ai-diagnosis-store'

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
    if (values.length > 100) throw new Error('D1のbind上限は100個です')
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
    return Promise.resolve(this.db.resolveRun(this.query, this.params))
  }
}

class SpyDatabase implements D1DatabaseLike {
  readonly executions: Execution[] = []
  nextRunChanges: number[] = []
  nextRunResults: D1ResultLike[] = []
  categoryRows = new Map<string, { label: string; category: string | null }>()
  batchCalls = 0
  firstResult: unknown = null

  prepare(query: string): D1PreparedStatementLike {
    return new SpyStatement(this, query)
  }

  async batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
    this.batchCalls += 1
    return Promise.all(statements.map((statement) => statement.run()))
  }

  resolveAll(query: string): unknown[] {
    if (query.includes('FROM incomes')) return [{ month: '202604', amount: 420000 }]
    if (query.includes('FROM expenses')) {
      return [
        {
          id: 'expense-1',
          month: '202604',
          label: '外食',
          amount: -48000,
          person: 'husband',
          is_carryover: 0,
          ai_category: null,
        },
      ]
    }
    if (query.includes('FROM carryovers')) {
      return [{ month: '202604', amount: -10000, is_cleared: 0 }]
    }
    return []
  }

  resolveRun(query: string, params: unknown[]): D1ResultLike {
    if (query.startsWith('UPDATE expenses\nSET ai_category') && this.categoryRows.size > 0) {
      const category = params[0] as string
      const expectedLabel = params.at(-1) as string
      const expenseIds = params.slice(3, -1) as string[]
      const changes = expenseIds.reduce((count, expenseId) => {
        const row = this.categoryRows.get(expenseId)
        if (!row || row.label !== expectedLabel) return count
        this.categoryRows.set(expenseId, { ...row, category })
        return count + 1
      }, 0)
      return { success: true, meta: { changes } }
    }
    return this.nextRunResults.shift() ?? {
      success: true,
      meta: { changes: this.nextRunChanges.shift() ?? 1 },
    }
  }
}

const NOW = '2026-04-20T12:00:00.000Z'
const runtime: Runtime = {
  randomUUID: () => 'diagnosis-id',
  now: () => new Date(NOW),
}

describe('AI家計診断D1ストア', () => {
  it('診断コンテキストから担当者を除外する', async () => {
    const db = new SpyDatabase()

    const result = await getDiagnosisContext(db, '202604')

    expect(result.expenses[0]).toEqual({
      id: 'expense-1',
      month: '202604',
      label: '外食',
      amount: -48000,
      isCarryover: false,
      aiCategory: null,
    })
    expect(result.expenses[0]).not.toHaveProperty('person')
    expect(db.executions.find(({ query }) => query.includes('FROM expenses'))?.query).not.toMatch(
      /SELECT[^;]*\bperson\b/i
    )
  })

  it('対象月と直前3か月を年境界を跨いで取得する', async () => {
    const db = new SpyDatabase()

    await getDiagnosisContext(db, '202601')

    expect(db.executions).toHaveLength(3)
    expect(db.executions.every(({ params }) => {
      return params.join(',') === '202601,202512,202511,202510'
    })).toBe(true)
  })

  it('有効なリースがある月の取得を拒否する', async () => {
    const db = new SpyDatabase()
    db.nextRunChanges = [0, 0]

    await expect(acquireDiagnosisLease(db, runtime, '202604', 'run-2')).resolves.toBe(false)
  })

  it('空きリースを2分間取得し、行がない場合だけ新規作成する', async () => {
    const existingDb = new SpyDatabase()
    existingDb.nextRunChanges = [1]
    const newDb = new SpyDatabase()
    newDb.nextRunChanges = [0, 1]

    await expect(acquireDiagnosisLease(existingDb, runtime, '202604', 'run-1')).resolves.toBe(true)
    await expect(acquireDiagnosisLease(newDb, runtime, '202604', 'run-1')).resolves.toBe(true)

    expect(existingDb.executions).toHaveLength(1)
    expect(existingDb.executions[0].params).toEqual([
      'run-1',
      '2026-04-20T12:02:00.000Z',
      NOW,
      '202604',
      NOW,
    ])
    expect(newDb.executions[1].query).toContain('INSERT OR IGNORE INTO ai_diagnoses')
  })

  it('許可カテゴリをD1バッチで最大100件まで保存する', async () => {
    const db = new SpyDatabase()
    db.nextRunChanges = [2, 1]

    await saveExpenseCategories(db, runtime, [
      { expenseIds: ['expense-1', 'expense-2'], category: 'dining', expectedLabel: '外食' },
      { expenseIds: ['expense-3'], category: 'healthcare', expectedLabel: '通院' },
    ])

    expect(db.batchCalls).toBe(1)
    expect(db.executions).toHaveLength(2)
    expect(db.executions[0].query).toContain("ai_category_source = 'ai'")
    expect(db.executions[0].params).toEqual([
      'dining',
      NOW,
      NOW,
      'expense-1',
      'expense-2',
      '外食',
    ])
  })

  it('同一カテゴリ100件を各statementのbind上限内で保存する', async () => {
    const db = new SpyDatabase()
    db.nextRunChanges = [96, 4]
    const expenseIds = Array.from({ length: 100 }, (_, index) => `expense-${index}`)

    await expect(
      saveExpenseCategories(db, runtime, [
        { expenseIds, category: 'dining', expectedLabel: '外食' },
      ])
    ).resolves.toBeUndefined()

    expect(db.executions).toHaveLength(2)
    expect(db.executions.map(({ params }) => params.length)).toEqual([100, 8])
  })

  it('ラベル変更後に古い分類を復活させず競合として拒否する', async () => {
    const db = new SpyDatabase()
    db.categoryRows.set('expense-1', { label: '通院', category: null })

    await expect(
      saveExpenseCategories(db, runtime, [
        { expenseIds: ['expense-1'], category: 'dining', expectedLabel: '外食' },
      ])
    ).rejects.toThrow('分類中に支出が変更')

    expect(db.categoryRows.get('expense-1')).toEqual({ label: '通院', category: null })
    expect(db.executions[0].query).toContain('AND label = ?')
  })

  it('許可されていないカテゴリと100件超の保存を拒否する', async () => {
    const db = new SpyDatabase()

    await expect(
      saveExpenseCategories(db, runtime, [
        { expenseIds: ['expense-1'], category: 'unknown', expectedLabel: '不明' },
      ])
    ).rejects.toThrow('許可されていない')
    await expect(
      saveExpenseCategories(db, runtime, [
        {
          expenseIds: Array.from({ length: 101 }, (_, index) => `expense-${index}`),
          category: 'other',
          expectedLabel: 'その他',
        },
      ])
    ).rejects.toThrow('100件まで')
    expect(db.executions).toHaveLength(0)
  })

  it('結果が未保存のリース専用行を保存済み診断として返さない', async () => {
    const db = new SpyDatabase()
    db.firstResult = {
      result_json: null,
      input_hash: null,
      analysis_version: null,
      updated_at: NOW,
    }

    await expect(getSavedDiagnosis(db, '202604')).resolves.toBeNull()
  })

  it('保存済み診断のJSONをunknownとして返す', async () => {
    const db = new SpyDatabase()
    db.firstResult = {
      result_json: '{"month":"202604","summaryText":"診断結果"}',
      input_hash: 'hash-1',
      analysis_version: 'v1',
      updated_at: NOW,
    }

    await expect(getSavedDiagnosis(db, '202604')).resolves.toEqual({
      diagnosis: { month: '202604', summaryText: '診断結果' },
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      updatedAt: NOW,
    })
  })

  it('runTokenが一致する月だけ診断結果を保存する', async () => {
    const db = new SpyDatabase()
    const diagnosis = { month: '202604', summaryText: '診断結果' }

    await saveDiagnosis(db, runtime, '202604', {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis,
    })

    expect(db.executions[0].query).toContain('WHERE month = ? AND run_token = ?')
    expect(db.executions[0].params).toEqual([
      JSON.stringify(diagnosis),
      'hash-1',
      'v1',
      NOW,
      '202604',
      'run-1',
    ])
  })

  it('runTokenが失効した診断結果は保存しない', async () => {
    const db = new SpyDatabase()
    db.nextRunChanges = [0]

    await expect(
      saveDiagnosis(db, runtime, '202604', {
        runToken: 'expired-run',
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        diagnosis: {},
      })
    ).rejects.toThrow('リースが失効')
  })

  it('runTokenが一致する月のリースだけを解放する', async () => {
    const db = new SpyDatabase()

    await releaseDiagnosisLease(db, '202604', 'run-1')

    expect(db.executions[0]).toEqual({
      query: `UPDATE ai_diagnoses
SET run_token = NULL, run_expires_at = NULL
WHERE month = ? AND run_token = ?`,
      params: ['202604', 'run-1'],
      method: 'run',
    })
  })

  it.each([
    ['changesが0', { success: true, meta: { changes: 0 } }],
    ['metaがない', { success: true }],
  ] as const)('%s場合はリース解放を失敗にする', async (_name, result) => {
    const db = new SpyDatabase()
    db.nextRunResults = [result]

    await expect(releaseDiagnosisLease(db, '202604', 'expired-run')).rejects.toThrow(
      'リースが失効'
    )
  })
})
