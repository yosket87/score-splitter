import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { BACKUP_MIGRATIONS, createExpectedBackupSchema, readBackupSchema, verifyMatchingSchemaObjects } from '../../../scripts/backup-schema.mjs'
import { restoreAndInspectBackup } from '../../../scripts/backup-sqlite.mjs'
import { createSqliteFixture } from '../../helpers/backup-sqlite-fixtures'

function inspect(sql: string, afterInspect?: (databasePath: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'backup-sqlite-test-'))
  const databasePath = path.join(directory, 'restored.sqlite')
  try {
    const inspected = restoreAndInspectBackup(Buffer.from(sql), databasePath,
      (executable: string, args: string[], options: { input?: Buffer } = {}) => {
        expect(executable).toBe('sqlite3')
        const result = spawnSync(executable, args, { input: options.input, encoding: 'utf8' })
        if (result.status !== 0) throw new Error(String(result.stderr))
        return result.stdout
      })
    afterInspect?.(databasePath)
    return inspected
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const snapshot = (stage: number) => [
  'PRAGMA legacy_alter_table=OFF;',
  'BEGIN;',
  ...BACKUP_MIGRATIONS.slice(0, stage).map(({ name }) => readFileSync(path.join(process.cwd(), 'cloudflare/worker/migrations', name), 'utf8')),
  'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT);',
  ...BACKUP_MIGRATIONS.slice(0, stage).map(({ name }, index) => `INSERT INTO d1_migrations VALUES (${index + 1}, '${name}');`),
  'COMMIT;',
].join('\n')

describe('実SQLiteによるバックアップschema検証', () => {
  it('fixtureの同じ生成SQLを再利用しても各試験の変更は別のコピーへ伝わらない', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-fixture-isolation-'))
    const first = path.join(directory, 'first.sqlite')
    const second = path.join(directory, 'second.sqlite')
    const sql = 'CREATE TABLE sample(id INTEGER); INSERT INTO sample VALUES(1);'
    try {
      createSqliteFixture(sql, first)
      const changed = spawnSync('sqlite3', ['-safe', first, 'UPDATE sample SET id=2;'], { encoding: 'utf8' })
      expect(changed.status, changed.stderr).toBe(0)
      createSqliteFixture(sql, second)
      const read = spawnSync('sqlite3', ['-safe', second, 'SELECT id FROM sample;'], { encoding: 'utf8' })
      expect(read.status, read.stderr).toBe(0)
      expect(read.stdout.trim()).toBe('1')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it.each([4, 5, 6, 7, 8, 9, 10, 11, 12, 13])('実migrationの000%sまで復元し全対象表を検査する', (stage) => {
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
  it.each([9, 10, 11])('世帯migration段階%sの期待定義と復元定義が一致する', (stage) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-household-schema-test-'))
    const run = (executable: string, args: string[], options: { input?: Buffer } = {}) => {
      const result = spawnSync(executable, args, { input: options.input, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout
    }
    try {
      const actual = inspect(snapshot(stage))
      const expected = createExpectedBackupSchema(
        BACKUP_MIGRATIONS.slice(0, stage).map(({ name }) => name),
        path.join(directory, 'expected.sqlite'), run,
      )
      expect(expected.stage).toBe(String(stage).padStart(4, '0'))
      expect(expected.tables).toHaveLength(16)
      expect(verifyMatchingSchemaObjects(expected.objects, actual.schema.objects)).toEqual(expected.objects)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('CLIの旧改名動作が有効でも期待schemaのFKは改名後の表を参照する', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-rename-schema-test-'))
    const databasePath = path.join(directory, 'expected.sqlite')
    const run = (executable: string, args: string[], options: { input?: Buffer } = {}) => {
      const result = spawnSync(executable, ['-cmd', 'PRAGMA legacy_alter_table=ON;', ...args], { input: options.input, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout
    }
    try {
      createExpectedBackupSchema(BACKUP_MIGRATIONS.slice(0, 11).map(({ name }) => name), databasePath, run)
      for (const table of ['payment_records', 'payment_voids']) {
        const references = JSON.parse(run('sqlite3', ['-safe', '-json', databasePath, `PRAGMA foreign_key_list(${table});`]))
        expect(references.some((row: { table: string }) => row.table.endsWith('_new'))).toBe(false)
        expect(references.some((row: { table: string }) => row.table === 'payment_operations')).toBe(true)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
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
  it('期待schemaのmigration途中で失敗したら直前stageのDDLと行へ戻る', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-expected-rollback-'))
    const databasePath = path.join(directory, 'expected.sqlite')
    let beforeFailure = ''
    const dump = () => spawnSync('sqlite3', ['-safe', databasePath, '.dump'], { encoding: 'utf8' }).stdout
    const run = (executable: string, args: string[], options: { input?: Buffer; label?: string } = {}) => {
      let input = options.input
      if (options.label?.endsWith('0013_add_google_identities.sql')) {
        beforeFailure = dump()
        input = Buffer.from(input!.toString().replace('CREATE TABLE users (', 'INSERT INTO _identity_migration_assert VALUES(0);\nCREATE TABLE users ('))
      }
      const result = spawnSync(executable, args, { input, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout
    }
    try {
      expect(() => createExpectedBackupSchema(BACKUP_MIGRATIONS.map(({ name }) => name), databasePath, run)).toThrow(/CHECK/)
      expect(beforeFailure).not.toBe('')
      expect(dump()).toBe(beforeFailure)
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

describe('Google認証の復元後の採番保証', () => {
  let dump: string
  const sequenceRow = "INSERT INTO sqlite_sequence VALUES('oauth_login_attempts',100);"
  beforeAll(() => {
    const directory = mkdtempSync(path.join(tmpdir(), 'backup-oauth-high-water-'))
    const sourcePath = path.join(directory, 'source.sqlite')
    try {
      const setup = spawnSync('sqlite3', ['-safe', '-bail', sourcePath], {
        input: [snapshot(13), ...['google-identity.sql', 'google-oauth-high-water.sql'].map((name) =>
          readFileSync(path.join(process.cwd(), 'tests/fixtures', name), 'utf8'))].join('\n'),
        encoding: 'utf8',
      })
      expect(setup.status, setup.stderr).toBe(0)
      const exported = spawnSync('sqlite3', ['-safe', sourcePath, '.dump'], { encoding: 'utf8' })
      expect(exported.status, exported.stderr).toBe(0)
      // macOSの.dumpは内部表の初期化を省くため、Wranglerと同じ一意復元をfixtureで明示する。
      dump = exported.stdout.replace(sequenceRow, `DELETE FROM sqlite_sequence;\n${sequenceRow}`)
      expect(dump).toContain(sequenceRow)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('清掃前の高水位100と残存MAX12を読み取り、試行も番号も変更しない', () => {
    const restored = inspect(dump, (databasePath) => {
      const queried = spawnSync('sqlite3', ['-safe', '-json', databasePath, `
        SELECT (SELECT seq FROM sqlite_sequence WHERE name='oauth_login_attempts') AS high_water,
          (SELECT MAX(sequence) FROM oauth_login_attempts) AS latest_attempt,
          (SELECT MAX(oauth_attempt_floor) FROM users) AS floor;
      `], { encoding: 'utf8' })
      expect(queried.status, queried.stderr).toBe(0)
      expect(JSON.parse(queried.stdout)).toEqual([{ high_water: 100, latest_attempt: 12, floor: 100 }])
    })
    expect(restored.schema.stage).toBe('0013')
    expect(restored.countRows[0].oauth_login_attempts).toBe(2)
    expect(restored.countRows[0].users).toBe(2)
  })

  it.each([
    ['欠落', ''],
    ['floor未満', sequenceRow.replace(',100)', ',99)')],
    ['残存試行未満', sequenceRow.replace(',100)', ',11)')],
    ['NULL', sequenceRow.replace(',100)', ',NULL)')],
    ['文字列', sequenceRow.replace(',100)', ",'100')")],
    ['小数', sequenceRow.replace(',100)', ',100.5)')],
    ['負数', sequenceRow.replace(',100)', ',-1)')],
    ['重複', `${sequenceRow}\n${sequenceRow}`],
    ['安全整数上限', sequenceRow.replace(',100)', ',9007199254740991)')],
    ['安全整数範囲外', sequenceRow.replace(',100)', ',9007199254740992)')],
  ])('DDLや業務表を変えずに高水位だけが%sのdumpを拒否する', (_label, replacement) => {
    expect(() => inspect(dump.replace(sequenceRow, replacement))).toThrow(/OAuth.*採番/)
  })

  it('次の番号が安全整数上限ちょうどになる復元を許可する', () => {
    const restored = inspect(dump.replace(sequenceRow, sequenceRow.replace(',100)', ',9007199254740990)')))
    expect(restored.integrityCheck).toBe('ok')
  })

  it('無効なuserのfloorも次回採番の下限として検査する', () => {
    expect(() => inspect(`${dump}
      UPDATE users SET active=0,session_epoch=session_epoch+1 WHERE id='user-b';
      UPDATE sqlite_sequence SET seq=99 WHERE name='oauth_login_attempts';
    `)).toThrow(/OAuth.*採番/)
  })

  it('全試行を清掃した後もuserのfloorを超える高水位の復元を必須にする', () => {
    const cleaned = `${dump}\nDELETE FROM sessions; DELETE FROM oauth_login_attempts;`
    expect(inspect(cleaned).countRows[0].oauth_login_attempts).toBe(0)
    expect(() => inspect(`${cleaned}\nDELETE FROM sqlite_sequence;`)).toThrow(/OAuth.*採番/)
  })

  it.each(['DELETE FROM sqlite_sequence;', 'UPDATE sqlite_sequence SET seq=11;'])(
    'userが空でも残存試行12に対する高水位の欠落・低下を拒否する: %s', (mutation) => {
      expect(() => inspect(`${snapshot(13)}
        INSERT INTO oauth_login_attempts(sequence,id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at)
          VALUES(12,'pending',printf('%064d',1),printf('%064d',1),'nonce','verifier','2026-09-06','2099-01-01');
        ${mutation}
      `)).toThrow(/OAuth.*採番/)
    }
  )
})
