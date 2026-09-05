import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_MIGRATIONS, createExpectedBackupSchema, readBackupSchema, verifyMatchingSchemaObjects } from '../../../scripts/backup-schema.mjs'
import { restoreAndInspectBackup } from '../../../scripts/backup-sqlite.mjs'

function inspect(sql: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'backup-sqlite-test-'))
  try {
    return restoreAndInspectBackup(Buffer.from(sql), path.join(directory, 'restored.sqlite'),
      (executable: string, args: string[], options: { input?: Buffer } = {}) => {
        expect(executable).toBe('sqlite3')
        const result = spawnSync(executable, args, { input: options.input, encoding: 'utf8' })
        if (result.status !== 0) throw new Error(String(result.stderr))
        return result.stdout
      })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const snapshot = (stage: number) => [
  ...BACKUP_MIGRATIONS.slice(0, stage).map(({ name }) => readFileSync(path.join(process.cwd(), 'cloudflare/worker/migrations', name), 'utf8')),
  'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT);',
  ...BACKUP_MIGRATIONS.slice(0, stage).map(({ name }, index) => `INSERT INTO d1_migrations VALUES (${index + 1}, '${name}');`),
].join('\n')

describe('実SQLiteによるバックアップschema検証', () => {
  it.each([4, 5, 6, 7, 8])('実migrationの000%sまで復元し全対象表を検査する', (stage) => {
    const result = inspect(snapshot(stage))
    expect(result.schema.stage).toBe(String(stage).padStart(4, '0'))
    expect(Object.keys(result.countRows[0]).sort()).toEqual(result.schema.tables)
    expect(result.integrityCheck).toBe('ok')
    expect(result.foreignKeyCheck).toEqual([])
  })
  it('SQLite復元が成功してもFK違反を拒否する', () => {
    expect(() => inspect(`${snapshot(8)}
      PRAGMA foreign_keys = OFF;
      DROP TRIGGER payment_record_operation;
      INSERT INTO payment_records VALUES ('record', 'missing-operation', '202609', 1, '2026-09-05', 'now', '{}', 'v1', 'v1');
    `)).toThrow(/foreign_key_check/)
  })
  it('migrationだけ8へ進んだ欠落schemaを拒否する', () => {
    expect(() => inspect(`${snapshot(8)} DROP TABLE ai_diagnoses;`)).toThrow(/schema/)
  })
  it('復元した追記専用台帳は実際のUPDATEを拒否する', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-trigger-test-'))
    const databasePath = path.join(directory, 'restored.sqlite')
    try {
      const setup = spawnSync('sqlite3', ['-safe', '-bail', databasePath], {
        input: `${snapshot(8)}
          INSERT INTO payment_operations VALUES ('op', '202609', 'record', 0, '{}', '{}', NULL, 'password', '2026-09-06T00:00:00.000Z');`,
        encoding: 'utf8',
      })
      expect(setup.status, setup.stderr).toBe(0)
      const update = spawnSync('sqlite3', ['-safe', databasePath, "UPDATE payment_operations SET month = '202610' WHERE id = 'op';"], { encoding: 'utf8' })
      expect(update.status).not.toBe(0)
      expect(update.stderr).toContain('PAYMENT_IMMUTABLE')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('実migrationのNBSPによる列境界改変をDDL不一致として拒否する', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-nbsp-test-'))
    const run = (executable: string, args: string[], options: { input?: Buffer } = {}) => {
      const result = spawnSync(executable, args, { input: options.input, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout
    }
    try {
      const actual = restoreAndInspectBackup(
        Buffer.from(snapshot(4).replace('label TEXT', 'label\u00a0TEXT')),
        path.join(directory, 'actual.sqlite'), run,
      )
      const expected = createExpectedBackupSchema(
        BACKUP_MIGRATIONS.slice(0, 4).map(({ name }) => name),
        path.join(directory, 'expected.sqlite'), run,
      )
      expect(() => verifyMatchingSchemaObjects(expected.objects, actual.schema.objects)).toThrow(/incomes/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('DQS_DML無効でも単一引用のmigration履歴を生成する', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-dqs-test-'))
    const run = (executable: string, args: string[], options: { input?: Buffer } = {}) => {
      const result = spawnSync(executable, ['-cmd', '.dbconfig dqs_dml off', ...args], { input: options.input, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout.split('\n').filter((line) => !line.trimStart().startsWith('dqs_dml ')).join('\n')
    }
    try {
      expect(createExpectedBackupSchema(
        BACKUP_MIGRATIONS.slice(0, 4).map(({ name }) => name),
        path.join(directory, 'expected.sqlite'), run,
      ).stage).toBe('0004')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('履歴・AI状態入りsourceをdumpして正常復元する', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-state-test-'))
    const sourcePath = path.join(directory, 'source.sqlite')
    try {
      const setup = spawnSync('sqlite3', ['-safe', '-bail', sourcePath], {
        input: `${snapshot(8)}
          INSERT INTO incomes VALUES ('income-1', '202609', '給与', 100000, 'husband', '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z');
          INSERT INTO ai_diagnoses (id, month, result_json, input_hash, analysis_version, created_at, updated_at)
          VALUES ('diagnosis-1', '202609', '{}', 'hash', 'v1', '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z');`,
        encoding: 'utf8',
      })
      expect(setup.status, setup.stderr).toBe(0)
      const dumped = spawnSync('sqlite3', ['-safe', sourcePath, '.dump'], { encoding: 'utf8' })
      expect(dumped.status).toBe(0)
      const restored = inspect(dumped.stdout)
      expect(restored.countRows[0].incomes).toBe(1)
      expect(restored.countRows[0].ai_diagnoses).toBe(1)
      expect(restored.countRows[0].ai_diagnosis_source_revision).toBe(1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('未実装0009を適用済みとして受け入れない', () => {
    const tables = [...BACKUP_MIGRATIONS.flatMap((migration) => migration.tables), 'd1_migrations']
    const migrations = BACKUP_MIGRATIONS.map((migration) => migration.name)
    expect(() => readBackupSchema(
      (sql: string) => (sql.includes('sqlite_schema') ? tables : migrations).map((name) => ({ name })),
      (filePath) => !String(filePath).endsWith('0009_add_households.sql'),
    )).toThrow(/リポジトリにありません/)
  })
})
