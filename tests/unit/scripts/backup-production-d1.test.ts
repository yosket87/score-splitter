import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  BACKUP_ROOT,
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
  parseReleaseVerificationArguments,
  runProductionBackup,
  runReleaseBackupVerification,
  selectProductionDatabase,
  validateBackupSql,
  validateManifest,
  validateReleaseManifest,
  verifyReleaseBackupArtifacts,
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

function createReleaseBackupFixture() {
  const backupRoot = mkdtempSync(path.join(tmpdir(), 'score-splitter-release-test-'))
  chmodSync(backupRoot, 0o700)
  const backupDirectory = path.join(backupRoot, '20260902T090000Z')
  mkdirSync(backupDirectory, { mode: 0o700 })
  chmodSync(backupDirectory, 0o700)

  const sqlPath = path.join(backupDirectory, 'score-splitter.sql')
  const sql = Buffer.from(
    "CREATE TABLE incomes (id TEXT PRIMARY KEY);\nINSERT INTO incomes VALUES ('1');\n"
  )
  writeFileSync(sqlPath, sql, { mode: 0o600 })
  chmodSync(sqlPath, 0o600)

  const bookmark = '00000000-0000000a-00004c9e'
  const timeTravelPath = path.join(backupDirectory, 'time-travel.json')
  writeFileSync(timeTravelPath, `${JSON.stringify({ bookmark })}\n`, { mode: 0o600 })
  chmodSync(timeTravelPath, 0o600)

  const restoreCommandArgs = [
    'd1',
    'time-travel',
    'restore',
    EXPECTED_DATABASE_ID,
    '--config',
    'cloudflare/worker/wrangler.jsonc',
    `--bookmark=${bookmark}`,
  ]
  const manifest = {
    schemaVersion: 2,
    verification: 'PASS',
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    gitHeadSha: VALID_GIT_HEAD_SHA,
    wranglerVersion: EXPECTED_WRANGLER_VERSION,
    configPath: 'cloudflare/worker/wrangler.jsonc',
    database: VALID_DATABASE_INFO,
    timeTravel: {
      bookmark,
      restoreExecutable: 'node_modules/.bin/wrangler',
      restoreCommandArgs,
      restoreCommand: ['node_modules/.bin/wrangler', ...restoreCommandArgs].join(' '),
    },
    sql: {
      path: sqlPath,
      bytes: sql.byteLength,
      sha256: createHash('sha256').update(sql).digest('hex'),
    },
    counts: {
      remote: EXPECTED_COUNTS,
      restored: { ...EXPECTED_COUNTS },
    },
    sqliteIntegrityCheck: 'ok',
  }
  const manifestPath = path.join(backupDirectory, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 })
  chmodSync(manifestPath, 0o600)

  return {
    backupRoot,
    backupDirectory,
    manifest,
    manifestPath,
    sqlPath,
    timeTravelPath,
  }
}

function createFakeBackupCommandRunner({ failAt }: { failAt?: string } = {}) {
  const executionOrder: string[] = []
  const countRows = [{ ...EXPECTED_COUNTS }]

  const commandRunner = (
    executable: string,
    args: string[],
    options: { input?: Buffer } = {}
  ) => {
    let operation: string
    let output: string
    if (args.length === 1 && args[0] === '--version') {
      operation = 'wrangler-version'
      output = '4.107.0\n'
    } else if (executable === 'git') {
      operation = 'git-head'
      output = `${VALID_GIT_HEAD_SHA}\n`
    } else if (args[0] === 'd1' && args[1] === 'list') {
      operation = 'd1-list'
      output = JSON.stringify([VALID_DATABASE_INFO])
    } else if (args[0] === 'd1' && args[1] === 'time-travel' && args[2] === 'info') {
      operation = 'bookmark'
      output = JSON.stringify({ bookmark: '00000000-0000000a-00004c9e' })
    } else if (args[0] === 'd1' && args[1] === 'export') {
      operation = 'export'
      const outputPath = args[args.indexOf('--output') + 1]
      writeFileSync(
        outputPath,
        "CREATE TABLE incomes (id TEXT PRIMARY KEY);\nINSERT INTO incomes VALUES ('1');\n"
      )
      output = ''
    } else if (args[0] === 'd1' && args[1] === 'execute') {
      operation = 'remote-count'
      output = JSON.stringify([{ success: true, results: countRows }])
    } else if (executable === 'sqlite3' && args.includes('-bail')) {
      operation = 'sqlite-restore'
      writeFileSync(args.at(-1) as string, options.input ?? Buffer.from('sqlite'))
      output = ''
    } else if (executable === 'sqlite3' && args.includes('PRAGMA integrity_check;')) {
      operation = 'sqlite-integrity'
      output = 'ok\n'
    } else if (executable === 'sqlite3' && args.includes('-json')) {
      operation = 'sqlite-count'
      output = JSON.stringify(countRows)
    } else {
      throw new Error(`想定外のコマンドです: ${executable} ${args.join(' ')}`)
    }

    executionOrder.push(operation)
    if (operation === failAt) {
      throw new Error(`${operation}のテスト失敗`)
    }
    return output
  }

  return { commandRunner, executionOrder }
}

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
    [['--confirm-production-d1', EXPECTED_DATABASE_ID, '--extra']],
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

  it('d1 listが配列でなければ拒否する', () => {
    expect(() => selectProductionDatabase({})).toThrow(/配列/)
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
    expect(() => normalizeWranglerVersion(undefined)).toThrow(/取得不能/)
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

  it('複合SELECT上限が5でも全8テーブルの件数を取得・正規化できる', () => {
    const args = buildRemoteCountArguments()
    const sql = args[args.indexOf('--command') + 1]
    const schema = BACKUP_TABLES.flatMap((tableName) => [
      `CREATE TABLE ${tableName} (id INTEGER);`,
      ...Array.from(
        { length: EXPECTED_COUNTS[tableName] },
        (_, index) => `INSERT INTO ${tableName} VALUES (${index});`
      ),
    ]).join('\n')
    const result = spawnSync('sqlite3', ['-batch', '-bail', '-json', ':memory:'], {
      input: `.limit compound_select 5\n${schema}\n${sql}\n`,
      encoding: 'utf8',
    })

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    const rows = JSON.parse(result.stdout.slice(result.stdout.indexOf('[')))
    expect(normalizeLocalCounts(rows)).toEqual(EXPECTED_COUNTS)
    expect(normalizeRemoteCounts([{ success: true, results: rows }])).toEqual(
      EXPECTED_COUNTS
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
    expect(() => normalizeGitHeadSha(undefined)).toThrow(/Git HEAD/)
  })

  it('Wranglerのresultsを8テーブルの件数へ正規化する', () => {
    const results = [{ ...EXPECTED_COUNTS }]

    expect(normalizeRemoteCounts([{ success: true, results }])).toEqual(EXPECTED_COUNTS)
    expect(normalizeRemoteCounts({ success: true, results })).toEqual(EXPECTED_COUNTS)
    expect(() => normalizeRemoteCounts([])).toThrow(/結果件数/)
    expect(() => normalizeRemoteCounts([{ success: false, results }])).toThrow(/成功/)
  })

  it('SQLiteのJSONを8テーブルの件数へ正規化する', () => {
    const results = [{ ...EXPECTED_COUNTS }]

    expect(normalizeLocalCounts(results)).toEqual(EXPECTED_COUNTS)
  })

  it('不足テーブルや負の件数を拒否する', () => {
    expect(() => normalizeLocalCounts([{ incomes: 2 }])).toThrow(/件数/)
    expect(() => normalizeLocalCounts([{ ...EXPECTED_COUNTS, incomes: -1 }])).toThrow(
      /件数/
    )
    expect(() => normalizeLocalCounts([null])).toThrow(/行/)
  })

  it('nullなど数値以外の件数を0件として扱わない', () => {
    const results = [{ ...EXPECTED_COUNTS, incomes: null }]

    expect(() => normalizeLocalCounts(results)).toThrow(/件数/)
  })

  it.each(BACKUP_TABLES)('%sの件数が欠落したらリモート・復元先とも拒否する', (tableName) => {
    const results = [
      Object.fromEntries(
        Object.entries(EXPECTED_COUNTS).filter(([name]) => name !== tableName)
      ),
    ]

    expect(() => normalizeLocalCounts(results)).toThrow(/件数/)
    expect(() => normalizeRemoteCounts([{ success: true, results }])).toThrow(/件数/)
  })

  it.each([
    [],
    [EXPECTED_COUNTS, EXPECTED_COUNTS],
    [{ ...EXPECTED_COUNTS, unknown: 0 }],
    [{ ...EXPECTED_COUNTS, incomes: '2' }],
    [{ ...EXPECTED_COUNTS, incomes: 1.5 }],
    [{ ...EXPECTED_COUNTS, incomes: Number.MAX_SAFE_INTEGER + 1 }],
    [BACKUP_TABLES.map((tableName) => EXPECTED_COUNTS[tableName])],
  ])('不正な件数結果をリモート・復元先とも拒否する: %j', (...results) => {
    expect(() => normalizeLocalCounts(results)).toThrow(/件数/)
    expect(() => normalizeRemoteCounts([{ success: true, results }])).toThrow(/件数/)
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
      sqlPath: path.join(BACKUP_ROOT, '20260902T090000Z', 'score-splitter.sql'),
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
      sqlPath: path.join(BACKUP_ROOT, '20260902T090000Z', 'score-splitter.sql'),
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

describe('本番切替直前のバックアップ実体再検証', () => {
  it('再検証モードはGit HEAD取得とローカル実体検証だけを実行する', () => {
    const fixture = createReleaseBackupFixture()
    const commands: Array<{ executable: string; args: string[] }> = []
    try {
      const result = runReleaseBackupVerification(
        ['--verify-release-manifest', fixture.manifestPath],
        {
          backupRoot: fixture.backupRoot,
          clock: () => new Date('2026-09-02T09:34:59.000Z'),
          commandRunner: (executable: string, args: string[]) => {
            commands.push({ executable, args })
            if (executable === 'git' && args.join(' ') === 'rev-parse HEAD') {
              return `${VALID_GIT_HEAD_SHA}\n`
            }
            throw new Error(`許可していない外部操作です: ${executable}`)
          },
        }
      )

      expect(result.manifestPath).toBe(fixture.manifestPath)
      expect(commands).toEqual([{ executable: 'git', args: ['rev-parse', 'HEAD'] }])
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })

  it('manifestとSQL実体・Time Travel情報・権限をまとめて再検証する', () => {
    const fixture = createReleaseBackupFixture()
    try {
      expect(
        verifyReleaseBackupArtifacts(fixture.manifestPath, {
          backupRoot: fixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toMatchObject({
        manifest: fixture.manifest,
        backupDirectory: fixture.backupDirectory,
        sqlPath: fixture.sqlPath,
        timeTravelPath: fixture.timeTravelPath,
      })
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })

  it.each([
    ['相対パス', '20260902T090000Z/manifest.json'],
    ['保存root外', '/tmp/score-splitter-outside/manifest.json'],
    ['root直下', 'manifest.json'],
    ['深すぎる階層', '20260902T090000Z/nested/manifest.json'],
  ])('%sのmanifestパスをCLI引数として拒否する', (_label, candidate) => {
    const fixture = createReleaseBackupFixture()
    try {
      const manifestPath = path.isAbsolute(candidate)
        ? candidate
        : candidate === '20260902T090000Z/manifest.json'
          ? candidate
          : path.join(fixture.backupRoot, candidate)
      expect(() =>
        parseReleaseVerificationArguments(
          ['--verify-release-manifest', manifestPath],
          fixture.backupRoot
        )
      ).toThrow(/manifest|絶対パス|保存root/)
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })

  it('相対要素で正規化前後が変わるmanifest絶対パスを拒否する', () => {
    const fixture = createReleaseBackupFixture()
    try {
      const redundantPath = `${fixture.backupDirectory}/../20260902T090000Z/manifest.json`
      expect(() =>
        parseReleaseVerificationArguments(
          ['--verify-release-manifest', redundantPath],
          fixture.backupRoot
        )
      ).toThrow(/相対要素/)
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })

  it('引数の不足・余剰・別フラグを安全側で拒否する', () => {
    const fixture = createReleaseBackupFixture()
    try {
      expect(() => parseReleaseVerificationArguments([], fixture.backupRoot)).toThrow(/引数/)
      expect(() =>
        parseReleaseVerificationArguments(
          ['--verify-release-manifest', fixture.manifestPath, '--extra'],
          fixture.backupRoot
        )
      ).toThrow(/引数/)
      expect(() =>
        parseReleaseVerificationArguments(
          ['--manifest', fixture.manifestPath],
          fixture.backupRoot
        )
      ).toThrow(/引数/)
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })

  it.each([
    ['保存root', 'backupRoot', 0o755],
    ['バックアップdir', 'backupDirectory', 0o755],
    ['SQL', 'sqlPath', 0o644],
    ['Time Travel', 'timeTravelPath', 0o644],
    ['manifest', 'manifestPath', 0o644],
  ])('%sの権限が規定値でなければ拒否する', (_label, key, mode) => {
    const fixture = createReleaseBackupFixture()
    try {
      chmodSync(fixture[key as keyof typeof fixture] as string, mode)
      expect(() =>
        verifyReleaseBackupArtifacts(fixture.manifestPath, {
          backupRoot: fixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toThrow(/権限/)
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })

  it('SQL実体が無い場合と実サイズがmanifestと違う場合を拒否する', () => {
    const missingFixture = createReleaseBackupFixture()
    try {
      rmSync(missingFixture.sqlPath)
      expect(() =>
        verifyReleaseBackupArtifacts(missingFixture.manifestPath, {
          backupRoot: missingFixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toThrow(/SQL/)
    } finally {
      rmSync(missingFixture.backupRoot, { recursive: true, force: true })
    }

    const sizeFixture = createReleaseBackupFixture()
    try {
      writeFileSync(sizeFixture.sqlPath, 'short', { mode: 0o600 })
      expect(() =>
        verifyReleaseBackupArtifacts(sizeFixture.manifestPath, {
          backupRoot: sizeFixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toThrow(/サイズ/)
    } finally {
      rmSync(sizeFixture.backupRoot, { recursive: true, force: true })
    }
  })

  it('同じサイズでもSQL実体のSHA-256がmanifestと違えば拒否する', () => {
    const fixture = createReleaseBackupFixture()
    try {
      const originalBytes = statSync(fixture.sqlPath).size
      writeFileSync(fixture.sqlPath, Buffer.alloc(originalBytes, 0x78), { mode: 0o600 })
      expect(() =>
        verifyReleaseBackupArtifacts(fixture.manifestPath, {
          backupRoot: fixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toThrow(/SHA-256/)
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })

  it('Time Travelファイルが無い場合とbookmarkがmanifestと違う場合を拒否する', () => {
    const missingFixture = createReleaseBackupFixture()
    try {
      rmSync(missingFixture.timeTravelPath)
      expect(() =>
        verifyReleaseBackupArtifacts(missingFixture.manifestPath, {
          backupRoot: missingFixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toThrow(/Time Travel/)
    } finally {
      rmSync(missingFixture.backupRoot, { recursive: true, force: true })
    }

    const mismatchFixture = createReleaseBackupFixture()
    try {
      writeFileSync(
        mismatchFixture.timeTravelPath,
        `${JSON.stringify({ bookmark: 'different-bookmark' })}\n`,
        { mode: 0o600 }
      )
      expect(() =>
        verifyReleaseBackupArtifacts(mismatchFixture.manifestPath, {
          backupRoot: mismatchFixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toThrow(/bookmark/)
    } finally {
      rmSync(mismatchFixture.backupRoot, { recursive: true, force: true })
    }
  })

  it('manifestのsymlinkを通常ファイルとして受け入れない', () => {
    const fixture = createReleaseBackupFixture()
    try {
      const realManifestPath = path.join(fixture.backupDirectory, 'manifest.real.json')
      writeFileSync(realManifestPath, `${JSON.stringify(fixture.manifest)}\n`, { mode: 0o600 })
      rmSync(fixture.manifestPath)
      symlinkSync(realManifestPath, fixture.manifestPath)

      expect(() =>
        verifyReleaseBackupArtifacts(fixture.manifestPath, {
          backupRoot: fixture.backupRoot,
          expectedGitHeadSha: VALID_GIT_HEAD_SHA,
          now: '2026-09-02T09:34:59.000Z',
        })
      ).toThrow(/通常ファイル/)
    } finally {
      rmSync(fixture.backupRoot, { recursive: true, force: true })
    }
  })
})

describe('本番D1バックアップ処理の統合', () => {
  it('偽CLIで検証順を固定し、Time Travel restoreを実行せずPASS manifestを作る', () => {
    const backupRoot = mkdtempSync(path.join(tmpdir(), 'score-splitter-backup-flow-'))
    chmodSync(backupRoot, 0o700)
    const { commandRunner, executionOrder } = createFakeBackupCommandRunner()
    let clockCalls = 0
    const originalUmask = process.umask()
    try {
      const result = runProductionBackup(
        ['--confirm-production-d1', EXPECTED_DATABASE_ID],
        {
          backupRoot,
          commandRunner,
          clock: () => {
            clockCalls += 1
            return new Date(clockCalls === 1 ? STARTED_AT : COMPLETED_AT)
          },
        }
      )

      expect(executionOrder).toEqual([
        'wrangler-version',
        'git-head',
        'd1-list',
        'bookmark',
        'export',
        'remote-count',
        'sqlite-restore',
        'sqlite-integrity',
        'sqlite-count',
      ])
      expect(executionOrder).not.toContain('time-travel-restore')
      expect(existsSync(result.manifestPath)).toBe(true)
      expect(statSync(result.manifestPath).mode & 0o777).toBe(0o600)
      expect(process.umask()).toBe(originalUmask)
    } finally {
      process.umask(originalUmask)
      rmSync(backupRoot, { recursive: true, force: true })
    }
  })

  it('途中で外部操作が失敗した場合はPASS manifestを作らない', () => {
    const backupRoot = mkdtempSync(path.join(tmpdir(), 'score-splitter-backup-flow-'))
    chmodSync(backupRoot, 0o700)
    const { commandRunner, executionOrder } = createFakeBackupCommandRunner({
      failAt: 'remote-count',
    })
    let clockCalls = 0
    try {
      expect(() =>
        runProductionBackup(['--confirm-production-d1', EXPECTED_DATABASE_ID], {
          backupRoot,
          commandRunner,
          clock: () => {
            clockCalls += 1
            return new Date(clockCalls === 1 ? STARTED_AT : COMPLETED_AT)
          },
        })
      ).toThrow(/remote-count/)
      expect(executionOrder).toEqual([
        'wrangler-version',
        'git-head',
        'd1-list',
        'bookmark',
        'export',
        'remote-count',
      ])
      expect(existsSync(path.join(backupRoot, '20260902T090000Z', 'manifest.json'))).toBe(
        false
      )
    } finally {
      rmSync(backupRoot, { recursive: true, force: true })
    }
  })
})
