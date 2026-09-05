import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_MIGRATIONS, readBackupSchema } from '../../../scripts/backup-schema.mjs'
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
  it('未実装0009を適用済みとして受け入れない', () => {
    const tables = [...BACKUP_MIGRATIONS.flatMap((migration) => migration.tables), 'd1_migrations']
    const migrations = BACKUP_MIGRATIONS.map((migration) => migration.name)
    expect(() => readBackupSchema(
      (sql: string) => (sql.includes('sqlite_schema') ? tables : migrations).map((name) => ({ name })),
      (filePath) => !String(filePath).endsWith('0009_add_households.sql'),
    )).toThrow(/リポジトリにありません/)
  })
})
