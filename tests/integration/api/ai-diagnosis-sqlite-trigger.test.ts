import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { D1DatabaseLike } from '../../../cloudflare/worker/src/d1'
import { acquireDiagnosisLease, releaseDiagnosisLease, saveDiagnosis } from '../../../cloudflare/worker/src/ai-diagnosis-store'

import { createHouseholdDataSqlite, householdA } from '../../helpers/household-data-sqlite'
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
    const fixture = createHouseholdDataSqlite()
    sqlite = fixture.sqlite
    db = fixture.db
    sqlite.exec("DELETE FROM ai_execution_guard WHERE household_id='household-b'; DELETE FROM ai_diagnosis_source_revision WHERE household_id='household-b'")
    sqlite.prepare(`INSERT INTO ai_diagnoses
      (household_id, id, month, run_token, run_expires_at, created_at, updated_at)
      VALUES ('3975b870-bbfa-49fd-ae3d-d273c9f6e107', 'test-id', '202609', 'test-run', '2026-09-03T12:05:00.000Z', ?, ?)`)
      .run(NOW, NOW)
    sqlite.exec(`UPDATE ai_execution_guard
      SET run_token = 'test-run', run_expires_at = '2026-09-03T12:05:00.000Z' WHERE id = 1`)


  })

  afterEach(() => sqlite.close())

  it('開始から2分30秒でも別の診断を拒否し、元の診断を保存できる', async () => {
    await releaseDiagnosisLease(db, householdA, '202609', 'test-run')
    await expect(acquireDiagnosisLease(db, runtime, householdA, '202609', 'test-run')).resolves.toEqual({ acquired: true })
    const later = { ...runtime, now: () => new Date('2026-09-03T12:02:30.000Z') }
    await expect(acquireDiagnosisLease(db, later, householdA, '202608', 'another-run')).resolves.toEqual({
      acquired: false, reason: 'busy', retryAfterSeconds: 30,
    })
    await expect(saveDiagnosis(db, later, householdA, '202609', input)).resolves.toBeUndefined()
    expect(sqlite.prepare("SELECT result_json, run_token FROM ai_diagnoses WHERE month = '202609'").get()).toEqual({
      result_json: JSON.stringify(input.diagnosis), run_token: null,
    })
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: null })
  })

  it('3分を過ぎた診断は引き継げるが、元の診断は保存も新ロックの解除もできない', async () => {
    await releaseDiagnosisLease(db, householdA, '202609', 'test-run')
    await acquireDiagnosisLease(db, runtime, householdA, '202609', 'test-run')
    const later = { ...runtime, now: () => new Date('2026-09-03T12:03:01.000Z') }
    await expect(acquireDiagnosisLease(db, later, householdA, '202608', 'another-run')).resolves.toEqual({ acquired: true })
    await expect(saveDiagnosis(db, later, householdA, '202609', input)).rejects.toThrow()
    await expect(releaseDiagnosisLease(db, householdA, '202609', 'test-run')).resolves.toBeUndefined()
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: 'another-run' })
  })

  it('保存とロック解放の連動更新を成功として扱い、診断を保存する', async () => {
    await expect(saveDiagnosis(db, runtime, householdA, '202609', input)).resolves.toBeUndefined()
    expect(sqlite.prepare('SELECT result_json, run_token FROM ai_diagnoses').get()).toEqual({
      result_json: JSON.stringify(input.diagnosis), run_token: null,
    })
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: null })
  })

  it('終了時に月次ロックと全体ロックを解除し、二度目の解放は拒否する', async () => {
    await expect(releaseDiagnosisLease(db, householdA, '202609', 'test-run')).resolves.toBeUndefined()
    expect(sqlite.prepare('SELECT run_token FROM ai_diagnoses').get()).toEqual({ run_token: null })
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: null })
    await expect(releaseDiagnosisLease(db, householdA, '202609', 'test-run')).rejects.toThrow('リースが失効')
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
    await expect(saveDiagnosis(db, runtime, householdA, '202609', input)).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM ai_diagnoses').get()).toEqual(before)
    expect(sqlite.prepare('SELECT * FROM ai_execution_guard').get()).toEqual(guardBefore)
  })

  it('別の実行トークンでは終了処理もロックを解除しない', async () => {
    await expect(releaseDiagnosisLease(db, householdA, '202609', 'another-run')).rejects.toThrow('リースが失効')
    expect(sqlite.prepare('SELECT run_token FROM ai_diagnoses').get()).toEqual({ run_token: 'test-run' })
    expect(sqlite.prepare('SELECT run_token FROM ai_execution_guard').get()).toEqual({ run_token: 'test-run' })
  })
})
