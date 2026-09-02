import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BACKUP_TABLES,
  EXPECTED_DATABASE_ID,
  EXPECTED_WRANGLER_VERSION,
  WRANGLER_EXECUTABLE,
  buildDatabaseListArguments,
  buildExportArguments,
  buildManifest,
  buildRemoteCountArguments,
  buildSqliteRestoreArguments,
  buildTimeTravelArguments,
  finalizeBackupFiles,
  normalizeDatabaseInfo,
  normalizeGitHeadSha,
  normalizeLocalCounts,
  normalizeRemoteCounts,
  normalizeTimeTravelInfo,
  normalizeWranglerVersion,
  parseConfirmedDatabaseId,
  selectProductionDatabase,
  validateBackupSql,
  validateManifest,
  validateReleaseManifest,
  verifyMatchingCounts,
} from '../../../scripts/backup-production-d1.mjs'

const VALID_DATABASE_INFO = {
  name: 'score-splitter',
  uuid: EXPECTED_DATABASE_ID,
  version: 'production',
}

const EXPECTED_COUNTS: Record<string, number> = {
  incomes: 2,
  expenses: 3,
  carryovers: 1,
  sessions: 4,
  passkey_credentials: 2,
  webauthn_challenges: 0,
  login_attempts: 5,
  waitlist_entries: 6,
}
const VALID_GIT_HEAD_SHA = 'a89c23cb841fca439bfc79a2393efcdbc872c46d'
const STARTED_AT = '2026-09-02T09:00:00.000Z'
const COMPLETED_AT = '2026-09-02T09:05:00.000Z'

describe('本番D1バックアップの対象確認', () => {
  it('CLIで固定UUIDを明示した場合だけ実行を許可する', () => {
    expect(
      parseConfirmedDatabaseId(['--confirm-production-d1', EXPECTED_DATABASE_ID])
    ).toBe(EXPECTED_DATABASE_ID)
  })

  it.each([
    [[]],
    [['--confirm-production-d1']],
    [['--confirm-production-d1', '51457bd5-8e0e-4645-ad34-86634285af2c']],
  ])('UUID確認が無いか不一致なら拒否する: %j', (args) => {
    expect(() => parseConfirmedDatabaseId(args)).toThrow(/UUID/)
  })

  it('本番DB情報を正規化する', () => {
    expect(normalizeDatabaseInfo(VALID_DATABASE_INFO)).toEqual(VALID_DATABASE_INFO)
  })

  it('d1 listから固定nameとUUIDに一致するproduction DBを一意に選ぶ', () => {
    expect(
      selectProductionDatabase([
        {
          name: 'score-splitter-db-dev',
          uuid: '51457bd5-8e0e-4645-ad34-86634285af2c',
          version: 'production',
        },
        VALID_DATABASE_INFO,
      ])
    ).toEqual(VALID_DATABASE_INFO)
  })

  it.each([
    [[]],
    [[VALID_DATABASE_INFO, { ...VALID_DATABASE_INFO }]],
  ])('d1 listに一致DBが無い、または重複する場合は拒否する', (databaseList) => {
    expect(() => selectProductionDatabase(databaseList)).toThrow(/一意/)
  })

  it.each([
    [{ ...VALID_DATABASE_INFO, name: 'score-splitter-db-dev' }, /DB名/],
    [{ ...VALID_DATABASE_INFO, uuid: '51457bd5-8e0e-4645-ad34-86634285af2c' }, /UUID/],
    [{ ...VALID_DATABASE_INFO, version: 'alpha' }, /production/],
  ])('name・UUID・versionの不一致を拒否する', (databaseInfo, error) => {
    expect(() => normalizeDatabaseInfo(databaseInfo)).toThrow(error)
  })
})

describe('本番D1バックアップのWrangler引数', () => {
  it('リポジトリ内の固定Wranglerだけを実行対象にする', () => {
    expect(WRANGLER_EXECUTABLE).toMatch(/\/node_modules\/\.bin\/wrangler$/)
    expect(buildDatabaseListArguments()).toEqual([
      'd1',
      'list',
      '--config',
      'cloudflare/worker/wrangler.jsonc',
      '--json',
    ])
  })

  it('Wranglerのバージョンが厳密に4.107.0の場合だけ受け入れる', () => {
    expect(normalizeWranglerVersion('4.107.0\n')).toBe(EXPECTED_WRANGLER_VERSION)
    expect(() => normalizeWranglerVersion('4.107.1\n')).toThrow(/4\.107\.0/)
    expect(() => normalizeWranglerVersion('wrangler 4.107.0\n')).toThrow(/4\.107\.0/)
  })

  it('exportは固定本番DB・remote・非対話確認・.part出力を使う', () => {
    expect(buildExportArguments('/persistent/score-splitter.sql.part')).toEqual([
      'd1',
      'export',
      EXPECTED_DATABASE_ID,
      '--remote',
      '--skip-confirmation',
      '--config',
      'cloudflare/worker/wrangler.jsonc',
      '--output',
      '/persistent/score-splitter.sql.part',
    ])
  })

  it('件数取得は固定本番DB・remote・非対話確認・JSONを使う', () => {
    expect(buildRemoteCountArguments()).toEqual(
      expect.arrayContaining([
        'd1',
        'execute',
        EXPECTED_DATABASE_ID,
        '--remote',
        '--yes',
        '--json',
      ])
    )
  })

  it('Time Travel取得もlistで検証済みの固定UUIDを使う', () => {
    expect(buildTimeTravelArguments()).toEqual([
      'd1',
      'time-travel',
      'info',
      EXPECTED_DATABASE_ID,
      '--config',
      'cloudflare/worker/wrangler.jsonc',
      '--json',
    ])
  })

  it('SQLite復元はsafe modeとbailを有効にする', () => {
    expect(buildSqliteRestoreArguments('/tmp/restored.sqlite')).toEqual([
      '-safe',
      '-bail',
      '/tmp/restored.sqlite',
    ])
  })
})

describe('本番D1バックアップの内容検証', () => {
  it('Time Travelのbookmarkを取り出す', () => {
    expect(normalizeTimeTravelInfo({ bookmark: '00000000-0000000a-00004c9e' })).toEqual({
      bookmark: '00000000-0000000a-00004c9e',
    })
  })

  it('空のTime Travel bookmarkを拒否する', () => {
    expect(() => normalizeTimeTravelInfo({ bookmark: ' ' })).toThrow(/bookmark/)
  })

  it.each(['bookmark/with/slash', 'bookmark;delete', 'bookmark with space', 'bookmark\nnext'])(
    '英数字・underscore・hyphen以外を含むbookmarkを拒否する: %s',
    (bookmark) => {
      expect(() => normalizeTimeTravelInfo({ bookmark })).toThrow(/bookmark/)
    }
  )

  it('schemaとdataを含むSQLだけを受け入れる', () => {
    const sql = [
      'CREATE TABLE incomes (id TEXT PRIMARY KEY);',
      "INSERT INTO incomes VALUES ('income-1');",
    ].join('\n')

    expect(validateBackupSql(sql)).toBe(sql.length)
  })

  it.each(['', 'CREATE TABLE incomes (id TEXT);', "INSERT INTO incomes VALUES ('income-1');"])(
    '空またはschema/dataの片方しかないSQLを拒否する',
    (sql) => {
      expect(() => validateBackupSql(sql)).toThrow(/SQL/)
    }
  )

  it.each([
    'CREATE TABLE incomes (id TEXT);\n.shell touch /tmp/pwned\nINSERT INTO incomes VALUES (\'1\');',
    'CREATE TABLE incomes (id TEXT);\n  .read /tmp/other.sql\nINSERT INTO incomes VALUES (\'1\');',
  ])('SQLiteの行頭ドットコマンドを含むSQLを拒否する', (sql) => {
    expect(() => validateBackupSql(sql)).toThrow(/ドットコマンド/)
  })

  it('Git HEAD SHAは40文字の小文字hexだけを受け入れる', () => {
    expect(normalizeGitHeadSha(`${VALID_GIT_HEAD_SHA}\n`)).toBe(VALID_GIT_HEAD_SHA)
    expect(() => normalizeGitHeadSha('main')).toThrow(/Git HEAD/)
    expect(() => normalizeGitHeadSha(VALID_GIT_HEAD_SHA.toUpperCase())).toThrow(/Git HEAD/)
  })

  it('Wranglerのresultsを8テーブルの件数へ正規化する', () => {
    const results = BACKUP_TABLES.map((tableName) => ({
      table_name: tableName,
      row_count: EXPECTED_COUNTS[tableName],
    }))

    expect(normalizeRemoteCounts([{ success: true, results }])).toEqual(EXPECTED_COUNTS)
  })

  it('SQLiteのJSONを8テーブルの件数へ正規化する', () => {
    const results = BACKUP_TABLES.map((tableName) => ({
      table_name: tableName,
      row_count: EXPECTED_COUNTS[tableName],
    }))

    expect(normalizeLocalCounts(results)).toEqual(EXPECTED_COUNTS)
  })

  it('不足テーブルや負の件数を拒否する', () => {
    expect(() =>
      normalizeLocalCounts([
        { table_name: 'incomes', row_count: -1 },
        { table_name: 'expenses', row_count: 0 },
      ])
    ).toThrow(/件数/)
  })

  it('nullなど数値以外の件数を0件として扱わない', () => {
    const results = BACKUP_TABLES.map((tableName) => ({
      table_name: tableName,
      row_count: tableName === 'incomes' ? null : EXPECTED_COUNTS[tableName],
    }))

    expect(() => normalizeLocalCounts(results)).toThrow(/件数/)
  })

  it('本番と復元先の件数が一致する場合だけ通す', () => {
    expect(verifyMatchingCounts(EXPECTED_COUNTS, { ...EXPECTED_COUNTS })).toEqual(
      EXPECTED_COUNTS
    )
    expect(() =>
      verifyMatchingCounts(EXPECTED_COUNTS, { ...EXPECTED_COUNTS, expenses: 2 })
    ).toThrow(/expenses/)
  })
})

describe('本番D1バックアップmanifest', () => {
  it('復元に必要な検証済み情報をPASS manifestへ固定する', () => {
    const manifest = buildManifest({
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      gitHeadSha: VALID_GIT_HEAD_SHA,
      wranglerVersion: '4.107.0',
      database: VALID_DATABASE_INFO,
      bookmark: '00000000-0000000a-00004c9e',
      sqlPath:
        '/Users/aa00037-tanaka/Documents/Backups/score-splitter/d1/20260902T090000Z/score-splitter.sql',
      sqlBytes: 2048,
      sqlSha256: 'a'.repeat(64),
      remoteCounts: EXPECTED_COUNTS,
      localCounts: { ...EXPECTED_COUNTS },
      integrityCheck: 'ok',
    })

    expect(validateManifest(manifest)).toEqual(manifest)
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      verification: 'PASS',
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      gitHeadSha: VALID_GIT_HEAD_SHA,
      configPath: 'cloudflare/worker/wrangler.jsonc',
      database: VALID_DATABASE_INFO,
      timeTravel: {
        bookmark: '00000000-0000000a-00004c9e',
        restoreCommand:
          'node_modules/.bin/wrangler d1 time-travel restore 7f8d3531-a833-4474-84d5-cee3ac98ee96 --config cloudflare/worker/wrangler.jsonc --bookmark=00000000-0000000a-00004c9e',
        restoreExecutable: 'node_modules/.bin/wrangler',
        restoreCommandArgs: [
          'd1',
          'time-travel',
          'restore',
          EXPECTED_DATABASE_ID,
          '--config',
          'cloudflare/worker/wrangler.jsonc',
          '--bookmark=00000000-0000000a-00004c9e',
        ],
      },
      sql: {
        bytes: 2048,
        sha256: 'a'.repeat(64),
      },
      counts: {
        remote: EXPECTED_COUNTS,
        restored: EXPECTED_COUNTS,
      },
      sqliteIntegrityCheck: 'ok',
    })

    expect(() =>
      validateManifest({
        ...manifest,
        counts: { remote: {}, restored: {} },
      })
    ).toThrow(/件数/)
    expect(() => validateManifest({ ...manifest, configPath: 'wrangler.jsonc' })).toThrow(
      /config/
    )
    expect(() =>
      validateManifest({
        ...manifest,
        timeTravel: {
          ...manifest.timeTravel,
          restoreCommandArgs: ['d1', 'delete', EXPECTED_DATABASE_ID],
        },
      })
    ).toThrow(/restore/)
    expect(() =>
      validateManifest({
        ...manifest,
        sql: { ...manifest.sql, path: '/tmp/score-splitter.sql' },
      })
    ).toThrow(/SQL/)

    expect(
      validateReleaseManifest(manifest, {
        expectedGitHeadSha: VALID_GIT_HEAD_SHA,
        now: '2026-09-02T09:34:59.000Z',
      })
    ).toEqual(manifest)
    expect(() =>
      validateReleaseManifest(manifest, {
        expectedGitHeadSha: 'b'.repeat(40),
        now: '2026-09-02T09:34:59.000Z',
      })
    ).toThrow(/HEAD/)
    expect(() =>
      validateReleaseManifest(manifest, {
        expectedGitHeadSha: VALID_GIT_HEAD_SHA,
        now: '2026-09-02T09:35:01.000Z',
      })
    ).toThrow(/30分/)
  })

  it('manifest確定後にだけ一時SQLiteを削除する', () => {
    const testDirectory = mkdtempSync(path.join(tmpdir(), 'score-splitter-finalize-test-'))
    try {
      const manifestPartPath = path.join(testDirectory, 'manifest.json.part')
      const manifestPath = path.join(testDirectory, 'manifest.json')
      const restoreDirectory = path.join(testDirectory, 'restore')
      mkdirSync(restoreDirectory)
      writeFileSync(path.join(restoreDirectory, 'restored.sqlite'), 'sqlite')
      writeFileSync(manifestPartPath, '{"verification":"PASS"}')

      finalizeBackupFiles({ manifestPartPath, manifestPath, restoreDirectory })

      expect(existsSync(manifestPath)).toBe(true)
      expect(existsSync(manifestPartPath)).toBe(false)
      expect(existsSync(restoreDirectory)).toBe(false)
    } finally {
      rmSync(testDirectory, { recursive: true, force: true })
    }
  })

  it('manifest確定に失敗した場合は調査用SQLiteを残す', () => {
    const testDirectory = mkdtempSync(path.join(tmpdir(), 'score-splitter-finalize-test-'))
    try {
      const manifestPartPath = path.join(testDirectory, 'manifest.json.part')
      const manifestPath = path.join(testDirectory, 'missing', 'manifest.json')
      const restoreDirectory = path.join(testDirectory, 'restore')
      mkdirSync(restoreDirectory)
      writeFileSync(path.join(restoreDirectory, 'restored.sqlite'), 'sqlite')
      writeFileSync(manifestPartPath, '{"verification":"PASS"}')

      expect(() =>
        finalizeBackupFiles({ manifestPartPath, manifestPath, restoreDirectory })
      ).toThrow()
      expect(existsSync(manifestPartPath)).toBe(true)
      expect(existsSync(restoreDirectory)).toBe(true)
    } finally {
      rmSync(testDirectory, { recursive: true, force: true })
    }
  })

  it('一時SQLite削除に失敗した場合は成功manifestを退避して非成功にする', () => {
    const testDirectory = mkdtempSync(path.join(tmpdir(), 'score-splitter-finalize-test-'))
    try {
      const manifestPartPath = path.join(testDirectory, 'manifest.json.part')
      const manifestPath = path.join(testDirectory, 'manifest.json')
      const missingRestoreDirectory = path.join(testDirectory, 'missing-restore')
      const cleanupFailedPath = path.join(testDirectory, 'manifest.cleanup-failed.part')
      writeFileSync(manifestPartPath, '{"verification":"PASS"}')

      expect(() =>
        finalizeBackupFiles({
          manifestPartPath,
          manifestPath,
          restoreDirectory: missingRestoreDirectory,
        })
      ).toThrow(/一時SQLite/)
      expect(existsSync(manifestPath)).toBe(false)
      expect(existsSync(cleanupFailedPath)).toBe(true)
      expect(statSync(cleanupFailedPath).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(testDirectory, { recursive: true, force: true })
    }
  })

  it('件数不一致やintegrity失敗ではPASS manifestを作らない', () => {
    const base = {
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      gitHeadSha: VALID_GIT_HEAD_SHA,
      wranglerVersion: '4.107.0',
      database: VALID_DATABASE_INFO,
      bookmark: '00000000-0000000a-00004c9e',
      sqlPath:
        '/Users/aa00037-tanaka/Documents/Backups/score-splitter/d1/20260902T090000Z/score-splitter.sql',
      sqlBytes: 2048,
      sqlSha256: 'a'.repeat(64),
      remoteCounts: EXPECTED_COUNTS,
      localCounts: EXPECTED_COUNTS,
    }

    expect(() =>
      buildManifest({
        ...base,
        localCounts: { ...EXPECTED_COUNTS, incomes: 1 },
        integrityCheck: 'ok',
      })
    ).toThrow(/incomes/)
    expect(() => buildManifest({ ...base, integrityCheck: 'malformed' })).toThrow(
      /integrity/
    )
  })
})
