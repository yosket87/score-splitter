import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { D1DatabaseLike, D1PreparedStatementLike } from '../../../cloudflare/worker/src/d1'
import { releaseDiagnosisLease, saveDiagnosis } from '../../../cloudflare/worker/src/ai-diagnosis-store'

const { DatabaseSync: SQLiteDatabase } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
const NOW = '2026-09-03T12:00:00.000Z'
const runtime = { now: () => new Date(NOW), randomUUID: () => 'unused' }
const input = {
  runToken: 'test-run', inputHash: 'hash', analysisVersion: 'v1',
  diagnosis: { summaryText: 'テスト診断' }, expectedSourceRevision: 0,
}

describe('AI診断のトリガーを含む保存・終了処理', () => {
  let sqlite: DatabaseSync
  let db: D1DatabaseLike

  beforeEach(() => {
    sqlite = new SQLiteDatabase(':memory:')
    sqlite.exec(`
      CREATE TABLE incomes (month TEXT, amount INTEGER);
      CREATE TABLE expenses (month TEXT, label TEXT, amount INTEGER, is_carryover INTEGER);
      CREATE TABLE carryovers (month TEXT, amount INTEGER, is_cleared INTEGER);
    `)
    for (const file of ['0005_add_ai_diagnosis.sql', '0006_add_ai_execution_guard.sql', '0007_add_ai_source_revision.sql']) {
      sqlite.exec(readFileSync(resolve('cloudflare/worker/migrations', file), 'utf8'))
    }
    sqlite.prepare(`INSERT INTO ai_diagnoses
      (id, month, run_token, run_expires_at, created_at, updated_at)
      VALUES ('test-id', '202609', 'test-run', '2026-09-03T12:05:00.000Z', ?, ?)`)
      .run(NOW, NOW)
    sqlite.exec(`UPDATE ai_execution_guard
      SET run_token = 'test-run', run_expires_at = '2026-09-03T12:05:00.000Z' WHERE id = 1`)

    const totalChanges = () => Number(sqlite.prepare('SELECT total_changes() AS count').get()?.count)
    const statement = (query: string, params: SQLInputValue[]): D1PreparedStatementLike => ({
      bind: (...values) => statement(query, values as SQLInputValue[]),
      first: async <T>() => (sqlite.prepare(query).get(...params) ?? null) as T | null,
      all: async <T>() => ({ results: sqlite.prepare(query).all(...params) as T[] }),
      run: async () => {
        // D1と同じく、直接更新だけでなくトリガーの更新も件数に含める。
        const before = totalChanges()
        sqlite.prepare(query).run(...params)
        return { success: true, meta: { changes: totalChanges() - before } }
      },
    })
    db = {
      prepare: (query) => statement(query, []),
      batch: async () => { throw new Error('このテストではbatchを使用しません') },
    }
  })

  afterEach(() => sqlite.close())

  it('保存とロック解放の連動更新を成功として扱い、診断を保存する', async () => {
    await expect(saveDiagnosis(db, runtime, '202609', input)).resolves.toBeUndefined()
    expect(sqlite.prepare('SELECT result_json, run_token FROM ai_diagnoses').get()).toEqual({
      result_json: JSON.stringify(input.diagnosis), run_token: null,
    })
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: null })
  })

  it('終了時に月次ロックと全体ロックを解除し、二度目の解放は拒否する', async () => {
    await expect(releaseDiagnosisLease(db, '202609', 'test-run')).resolves.toBeUndefined()
    expect(sqlite.prepare('SELECT run_token FROM ai_diagnoses').get()).toEqual({ run_token: null })
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: null })
    await expect(releaseDiagnosisLease(db, '202609', 'test-run')).rejects.toThrow('リースが失効')
  })

  it.each([
    ['月次トークン不一致', "UPDATE ai_diagnoses SET run_token = 'another-run'"],
    ['月次期限切れ', "UPDATE ai_diagnoses SET run_expires_at = '2026-09-03T11:59:00.000Z'"],
    ['全体トークン不一致', "UPDATE ai_execution_guard SET run_token = 'another-run'"],
    ['全体期限切れ', "UPDATE ai_execution_guard SET run_expires_at = '2026-09-03T11:59:00.000Z'"],
    ['元データ更新', 'UPDATE ai_diagnosis_source_revision SET revision = 1'],
  ])('%sでは保存もロック解除もしない', async (_name, change) => {
    sqlite.exec(change)
    const before = sqlite.prepare('SELECT * FROM ai_diagnoses').get()
    const guardBefore = sqlite.prepare('SELECT * FROM ai_execution_guard').get()
    await expect(saveDiagnosis(db, runtime, '202609', input)).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM ai_diagnoses').get()).toEqual(before)
    expect(sqlite.prepare('SELECT * FROM ai_execution_guard').get()).toEqual(guardBefore)
  })

  it('別の実行トークンでは終了処理もロックを解除しない', async () => {
    await expect(releaseDiagnosisLease(db, '202609', 'another-run')).rejects.toThrow('リースが失効')
    expect(sqlite.prepare('SELECT run_token FROM ai_diagnoses').get()).toEqual({ run_token: 'test-run' })
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: 'test-run' })
  })
})
