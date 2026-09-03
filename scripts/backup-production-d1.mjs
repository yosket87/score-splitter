import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export const EXPECTED_DATABASE_NAME = 'score-splitter'
export const EXPECTED_DATABASE_ID = '7f8d3531-a833-4474-84d5-cee3ac98ee96'
export const EXPECTED_DATABASE_VERSION = 'production'
export const EXPECTED_WRANGLER_VERSION = '4.107.0'
export const CONFIG_PATH = 'cloudflare/worker/wrangler.jsonc'
export const BACKUP_ROOT = path.join(homedir(), 'Documents', 'Backups', 'score-splitter', 'd1')
export const BACKUP_TABLES = Object.freeze([
  'incomes',
  'expenses',
  'carryovers',
  'sessions',
  'passkey_credentials',
  'webauthn_challenges',
  'login_attempts',
  'waitlist_entries',
])

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wranglerExecutableRelative = 'node_modules/.bin/wrangler'
export const WRANGLER_EXECUTABLE = path.join(repositoryRoot, wranglerExecutableRelative)
// D1の複合SELECT上限に依存せず、全テーブルを同じ文で集計する。
const countSql = `SELECT ${BACKUP_TABLES.map(
  (tableName) => `(SELECT COUNT(*) FROM ${tableName}) AS ${tableName}`
).join(',\n')}`

function asObject(value, label) {
  const candidate = Array.isArray(value) && value.length === 1 ? value[0] : value
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new Error(`${label}がJSON objectではありません`)
  }
  return candidate
}

function parseJson(value, label) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label}が有効なJSONではありません`)
  }
}

export function parseConfirmedDatabaseId(args) {
  const confirmedId = Array.isArray(args) && args.length === 2 ? args[1] : undefined

  if (args?.[0] !== '--confirm-production-d1' || confirmedId !== EXPECTED_DATABASE_ID) {
    throw new Error(
      `本番D1の固定UUIDを --confirm-production-d1 ${EXPECTED_DATABASE_ID} で明示してください`
    )
  }

  return confirmedId
}

function normalizeReleaseManifestPath(manifestPath, backupRoot) {
  if (typeof manifestPath !== 'string' || !path.isAbsolute(manifestPath)) {
    throw new Error('再検証するmanifestは絶対パスで指定してください')
  }
  if (path.normalize(manifestPath) !== manifestPath) {
    throw new Error('再検証するmanifestパスに冗長な区切りや相対要素は使用できません')
  }

  const relativePath = path.relative(backupRoot, manifestPath)
  const pathParts = relativePath.split(path.sep)
  if (
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    pathParts.length !== 2 ||
    !/^\d{8}T\d{6}Z$/.test(pathParts[0]) ||
    pathParts[1] !== 'manifest.json'
  ) {
    throw new Error('manifestは固定保存root直下のバックアップdirから指定してください')
  }

  return manifestPath
}

export function parseReleaseVerificationArguments(args, backupRoot = BACKUP_ROOT) {
  if (
    !Array.isArray(args) ||
    args.length !== 2 ||
    args[0] !== '--verify-release-manifest'
  ) {
    throw new Error(
      '再検証の引数は --verify-release-manifest <manifest.jsonの絶対パス> のみ指定できます'
    )
  }

  return normalizeReleaseManifestPath(args[1], backupRoot)
}

export function normalizeDatabaseInfo(value) {
  const info = asObject(value, 'D1情報')
  if (info.name !== EXPECTED_DATABASE_NAME) {
    throw new Error(`本番DB名が不一致です: ${String(info.name)}`)
  }
  if (info.uuid !== EXPECTED_DATABASE_ID) {
    throw new Error(`本番D1 UUIDが不一致です: ${String(info.uuid)}`)
  }
  if (info.version !== EXPECTED_DATABASE_VERSION) {
    throw new Error(`D1 versionがproductionではありません: ${String(info.version)}`)
  }

  return {
    name: info.name,
    uuid: info.uuid,
    version: info.version,
  }
}

export function selectProductionDatabase(value) {
  if (!Array.isArray(value)) {
    throw new Error('D1一覧が配列ではありません')
  }
  const matches = value.filter(
    (database) =>
      typeof database === 'object' &&
      database !== null &&
      database.name === EXPECTED_DATABASE_NAME &&
      database.uuid === EXPECTED_DATABASE_ID
  )
  if (matches.length !== 1) {
    throw new Error(`固定nameとUUIDに一致する本番D1が一意ではありません: ${matches.length}件`)
  }

  return normalizeDatabaseInfo(matches[0])
}

export function normalizeTimeTravelInfo(value) {
  const info = asObject(value, 'Time Travel情報')
  if (typeof info.bookmark !== 'string' || !/^[A-Za-z0-9_-]+$/.test(info.bookmark)) {
    throw new Error('Time Travel bookmarkは英数字・underscore・hyphenのみ使用できます')
  }

  return { bookmark: info.bookmark }
}

export function validateBackupSql(sql) {
  if (typeof sql === 'string' && /^[\t ]*\.[A-Za-z]/m.test(sql)) {
    throw new Error('バックアップSQLにSQLiteの行頭ドットコマンドが含まれています')
  }
  if (
    typeof sql !== 'string' ||
    sql.length === 0 ||
    !/\bCREATE\s+TABLE\b/i.test(sql) ||
    !/\bINSERT\s+INTO\b/i.test(sql)
  ) {
    throw new Error('バックアップSQLにschemaとdataの両方が含まれていません')
  }

  return Buffer.byteLength(sql)
}

export function normalizeWranglerVersion(value) {
  const version = typeof value === 'string' ? value.trim() : ''
  if (version !== EXPECTED_WRANGLER_VERSION) {
    throw new Error(
      `Wrangler versionは${EXPECTED_WRANGLER_VERSION}である必要があります: ${version || '取得不能'}`
    )
  }
  return version
}

export function normalizeGitHeadSha(value) {
  const gitHeadSha = typeof value === 'string' ? value.trim() : ''
  if (!/^[a-f0-9]{40}$/.test(gitHeadSha)) {
    throw new Error('Git HEAD SHAが40文字の小文字hexではありません')
  }
  return gitHeadSha
}

export function buildDatabaseListArguments() {
  return ['d1', 'list', '--config', CONFIG_PATH, '--json']
}

export function buildExportArguments(outputPath) {
  return [
    'd1',
    'export',
    EXPECTED_DATABASE_ID,
    '--remote',
    '--skip-confirmation',
    '--config',
    CONFIG_PATH,
    '--output',
    outputPath,
  ]
}

export function buildRemoteCountArguments() {
  return [
    'd1',
    'execute',
    EXPECTED_DATABASE_ID,
    '--config',
    CONFIG_PATH,
    '--remote',
    '--yes',
    '--json',
    '--command',
    `${countSql};`,
  ]
}

export function buildTimeTravelArguments() {
  return [
    'd1',
    'time-travel',
    'info',
    EXPECTED_DATABASE_ID,
    '--config',
    CONFIG_PATH,
    '--json',
  ]
}

export function buildSqliteRestoreArguments(restoreDatabasePath) {
  return ['-safe', '-bail', restoreDatabasePath]
}

function buildRestoreCommandArguments(bookmark) {
  return [
    'd1',
    'time-travel',
    'restore',
    EXPECTED_DATABASE_ID,
    '--config',
    CONFIG_PATH,
    `--bookmark=${bookmark}`,
  ]
}

function normalizeCounts(rows) {
  if (!Array.isArray(rows)) {
    throw new Error('テーブル件数が配列ではありません')
  }

  const counts = {}
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) {
      throw new Error('テーブル件数の行が不正です')
    }
    const tableName = row.table_name
    const rowCount = row.row_count
    if (
      !BACKUP_TABLES.includes(tableName) ||
      typeof rowCount !== 'number' ||
      !Number.isSafeInteger(rowCount) ||
      rowCount < 0 ||
      Object.hasOwn(counts, tableName)
    ) {
      throw new Error(`テーブル件数が不正です: ${String(tableName)}`)
    }
    counts[tableName] = rowCount
  }

  for (const tableName of BACKUP_TABLES) {
    if (!Object.hasOwn(counts, tableName)) {
      throw new Error(`テーブル件数が不足しています: ${tableName}`)
    }
  }

  return counts
}

export function normalizeRemoteCounts(value) {
  const executions = Array.isArray(value) ? value : [value]
  if (executions.length !== 1) {
    throw new Error('Wrangler D1 executeの結果件数が不正です')
  }
  const result = asObject(executions[0], 'Wrangler D1 execute結果')
  if (result.success !== true) {
    throw new Error('Wrangler D1 executeが成功していません')
  }
  return normalizeLocalCounts(result.results)
}

export function normalizeLocalCounts(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error('テーブル件数の行数が不正です')
  }
  const row = value[0]
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new Error('テーブル件数の行が不正です')
  }
  if (Object.keys(row).some((tableName) => !BACKUP_TABLES.includes(tableName))) {
    throw new Error('テーブル件数に想定外の列が含まれています')
  }
  return normalizeCounts(
    BACKUP_TABLES.map((tableName) => ({
      table_name: tableName,
      row_count: Object.hasOwn(row, tableName) ? row[tableName] : undefined,
    }))
  )
}

export function verifyMatchingCounts(remoteCounts, localCounts) {
  const normalizedRemote = normalizeCounts(
    BACKUP_TABLES.map((tableName) => ({
      table_name: tableName,
      row_count: remoteCounts?.[tableName],
    }))
  )
  const normalizedLocal = normalizeCounts(
    BACKUP_TABLES.map((tableName) => ({
      table_name: tableName,
      row_count: localCounts?.[tableName],
    }))
  )

  for (const tableName of BACKUP_TABLES) {
    if (normalizedRemote[tableName] !== normalizedLocal[tableName]) {
      throw new Error(
        `${tableName}の件数が不一致です: remote=${String(normalizedRemote[tableName])}, restored=${String(normalizedLocal[tableName])}`
      )
    }
  }

  return normalizedRemote
}

export function buildManifest(
  {
    startedAt,
    completedAt,
    gitHeadSha,
    wranglerVersion,
    database,
    bookmark,
    sqlPath,
    sqlBytes,
    sqlSha256,
    remoteCounts,
    localCounts,
    integrityCheck,
  },
  { backupRoot = BACKUP_ROOT } = {}
) {
  const verifiedDatabase = normalizeDatabaseInfo(database)
  const verifiedTimeTravel = normalizeTimeTravelInfo({ bookmark })
  const verifiedCounts = verifyMatchingCounts(remoteCounts, localCounts)
  const verifiedGitHeadSha = normalizeGitHeadSha(gitHeadSha)
  const verifiedWranglerVersion = normalizeWranglerVersion(wranglerVersion)
  if (integrityCheck !== 'ok') {
    throw new Error(`SQLite integrity_checkがokではありません: ${String(integrityCheck)}`)
  }
  const restoreCommandArgs = buildRestoreCommandArguments(verifiedTimeTravel.bookmark)

  const manifest = {
    schemaVersion: 2,
    verification: 'PASS',
    startedAt,
    completedAt,
    gitHeadSha: verifiedGitHeadSha,
    wranglerVersion: verifiedWranglerVersion,
    configPath: CONFIG_PATH,
    database: verifiedDatabase,
    timeTravel: {
      bookmark: verifiedTimeTravel.bookmark,
      restoreExecutable: wranglerExecutableRelative,
      restoreCommandArgs,
      restoreCommand: [wranglerExecutableRelative, ...restoreCommandArgs].join(' '),
    },
    sql: {
      path: sqlPath,
      bytes: sqlBytes,
      sha256: sqlSha256,
    },
    counts: {
      remote: verifiedCounts,
      restored: { ...verifiedCounts },
    },
    sqliteIntegrityCheck: integrityCheck,
  }

  return validateManifest(manifest, { backupRoot })
}

export function validateManifest(value, { backupRoot = BACKUP_ROOT } = {}) {
  const manifest = asObject(value, 'manifest')
  if (manifest.schemaVersion !== 2 || manifest.verification !== 'PASS') {
    throw new Error('manifestのschemaVersionまたはverificationが不正です')
  }
  const startedAt = normalizeIsoTimestamp(manifest.startedAt, 'manifest.startedAt')
  const completedAt = normalizeIsoTimestamp(manifest.completedAt, 'manifest.completedAt')
  if (
    Date.parse(completedAt) < Date.parse(startedAt) ||
    manifest.configPath !== CONFIG_PATH
  ) {
    throw new Error('manifestの開始/完了日時またはconfigが不正です')
  }
  normalizeGitHeadSha(manifest.gitHeadSha)
  normalizeWranglerVersion(manifest.wranglerVersion)
  normalizeDatabaseInfo(manifest.database)
  const timeTravel = asObject(manifest.timeTravel, 'manifest.timeTravel')
  const { bookmark } = normalizeTimeTravelInfo(timeTravel)
  const expectedRestoreCommandArgs = buildRestoreCommandArguments(bookmark)
  const expectedRestoreCommand = [wranglerExecutableRelative, ...expectedRestoreCommandArgs].join(
    ' '
  )
  if (
    timeTravel.restoreExecutable !== wranglerExecutableRelative ||
    !Array.isArray(timeTravel.restoreCommandArgs) ||
    JSON.stringify(timeTravel.restoreCommandArgs) !== JSON.stringify(expectedRestoreCommandArgs) ||
    timeTravel.restoreCommand !== expectedRestoreCommand
  ) {
    throw new Error('manifestの手動restoreコマンドが不正です')
  }
  const sql = asObject(manifest.sql, 'manifest.sql')
  const relativeSqlPath =
    typeof sql.path === 'string' ? path.relative(backupRoot, sql.path) : undefined
  if (
    typeof sql.path !== 'string' ||
    sql.path.length === 0 ||
    relativeSqlPath === undefined ||
    relativeSqlPath.startsWith('..') ||
    path.isAbsolute(relativeSqlPath) ||
    path.basename(sql.path) !== 'score-splitter.sql' ||
    !Number.isSafeInteger(sql.bytes) ||
    sql.bytes <= 0 ||
    typeof sql.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(sql.sha256)
  ) {
    throw new Error('manifestのSQL情報が不正です')
  }
  const counts = asObject(manifest.counts, 'manifest.counts')
  verifyMatchingCounts(counts.remote, counts.restored)
  if (manifest.sqliteIntegrityCheck !== 'ok') {
    throw new Error('manifestのSQLite integrity_checkが不正です')
  }

  return value
}

function normalizeIsoTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label}が有効なISO日時ではありません`)
  }
  const normalized = new Date(value).toISOString()
  if (normalized !== value) {
    throw new Error(`${label}が正規化されたISO日時ではありません`)
  }
  return normalized
}

export function validateReleaseManifest(
  value,
  { expectedGitHeadSha, now, backupRoot = BACKUP_ROOT }
) {
  const manifest = validateManifest(value, { backupRoot })
  const verifiedExpectedGitHeadSha = normalizeGitHeadSha(expectedGitHeadSha)
  if (manifest.gitHeadSha !== verifiedExpectedGitHeadSha) {
    throw new Error(
      `manifestのGit HEAD SHAがPR HEADと一致しません: ${manifest.gitHeadSha} != ${verifiedExpectedGitHeadSha}`
    )
  }

  const verifiedNow = normalizeIsoTimestamp(now, '切替確認日時')
  const ageMilliseconds = Date.parse(verifiedNow) - Date.parse(manifest.completedAt)
  if (ageMilliseconds < 0 || ageMilliseconds > 30 * 60 * 1000) {
    throw new Error('manifestは本番切替直前30分以内に完了したものではありません')
  }

  return manifest
}

function readPrivateRegularFile(filePath, label) {
  let stats
  try {
    stats = lstatSync(filePath)
  } catch (error) {
    throw new Error(`${label}が見つからないか参照できません: ${filePath}`, { cause: error })
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label}は通常ファイルである必要があります: ${filePath}`)
  }
  if ((stats.mode & 0o777) !== 0o600) {
    throw new Error(`${label}の権限は0600である必要があります: ${filePath}`)
  }

  return { contents: readFileSync(filePath), stats }
}

function verifyPrivateDirectory(directoryPath, label) {
  let stats
  try {
    stats = lstatSync(directoryPath)
  } catch (error) {
    throw new Error(`${label}が見つからないか参照できません: ${directoryPath}`, {
      cause: error,
    })
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label}は通常ディレクトリである必要があります: ${directoryPath}`)
  }
  if ((stats.mode & 0o777) !== 0o700) {
    throw new Error(`${label}の権限は0700である必要があります: ${directoryPath}`)
  }
}

export function verifyReleaseBackupArtifacts(
  manifestPath,
  { expectedGitHeadSha, now, backupRoot = BACKUP_ROOT }
) {
  const verifiedManifestPath = normalizeReleaseManifestPath(manifestPath, backupRoot)
  const backupDirectory = path.dirname(verifiedManifestPath)
  verifyPrivateDirectory(backupRoot, 'バックアップ保存root')
  verifyPrivateDirectory(backupDirectory, 'バックアップdir')

  const manifestFile = readPrivateRegularFile(verifiedManifestPath, 'manifest')
  const manifest = validateReleaseManifest(
    parseJson(manifestFile.contents.toString('utf8'), 'manifest'),
    { expectedGitHeadSha, now, backupRoot }
  )

  const sqlPath = path.join(backupDirectory, 'score-splitter.sql')
  if (manifest.sql.path !== sqlPath) {
    throw new Error('manifestのSQLパスが同じバックアップdirの固定ファイルと一致しません')
  }
  const sqlFile = readPrivateRegularFile(sqlPath, 'SQL')
  if (sqlFile.stats.size !== manifest.sql.bytes) {
    throw new Error(
      `SQL実サイズがmanifestと一致しません: ${sqlFile.stats.size} != ${manifest.sql.bytes}`
    )
  }
  const actualSqlSha256 = createHash('sha256').update(sqlFile.contents).digest('hex')
  if (actualSqlSha256 !== manifest.sql.sha256) {
    throw new Error('SQL実体のSHA-256がmanifestと一致しません')
  }

  const timeTravelPath = path.join(backupDirectory, 'time-travel.json')
  const timeTravelFile = readPrivateRegularFile(timeTravelPath, 'Time Travel情報')
  const timeTravel = normalizeTimeTravelInfo(
    parseJson(timeTravelFile.contents.toString('utf8'), 'Time Travel情報')
  )
  if (timeTravel.bookmark !== manifest.timeTravel.bookmark) {
    throw new Error('Time Travel bookmarkがmanifestと一致しません')
  }

  return {
    manifest,
    manifestPath: verifiedManifestPath,
    backupDirectory,
    sqlPath,
    timeTravelPath,
  }
}

function runCommand(executable, args, { input, label } = {}) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    shell: false,
    encoding: input === undefined ? 'utf8' : undefined,
    input,
    maxBuffer: 10 * 1024 * 1024,
  })

  if (result.error) {
    throw new Error(`${label ?? executable}を起動できません: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : String(result.stderr ?? '')
    throw new Error(`${label ?? executable}が失敗しました: ${stderr.trim()}`)
  }

  return Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout
}

export function runReleaseBackupVerification(
  args = process.argv.slice(2),
  {
    backupRoot = BACKUP_ROOT,
    clock = () => new Date(),
    commandRunner = runCommand,
  } = {}
) {
  const manifestPath = parseReleaseVerificationArguments(args, backupRoot)
  const gitHeadSha = normalizeGitHeadSha(
    commandRunner('git', ['rev-parse', 'HEAD'], { label: 'Git HEAD SHA取得' })
  )

  return verifyReleaseBackupArtifacts(manifestPath, {
    backupRoot,
    expectedGitHeadSha: gitHeadSha,
    now: clock().toISOString(),
  })
}

function writePrivateFile(filePath, value) {
  writeFileSync(filePath, value, { mode: 0o600, flag: 'wx' })
  chmodSync(filePath, 0o600)
}

function createTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function finalizeBackupFiles({ manifestPartPath, manifestPath, restoreDirectory }) {
  renameSync(manifestPartPath, manifestPath)
  chmodSync(manifestPath, 0o600)

  try {
    rmSync(restoreDirectory, { recursive: true })
    return { temporaryDatabaseRemoved: true }
  } catch (error) {
    const cleanupFailedPath = path.join(
      path.dirname(manifestPath),
      'manifest.cleanup-failed.part'
    )
    renameSync(manifestPath, cleanupFailedPath)
    chmodSync(cleanupFailedPath, 0o600)
    throw new Error(
      `一時SQLiteを削除できないためバックアップを確定しません: ${restoreDirectory}（検証情報: ${cleanupFailedPath}、原因: ${error instanceof Error ? error.message : String(error)}）`,
      { cause: error }
    )
  }
}

export function runProductionBackup(
  args = process.argv.slice(2),
  {
    backupRoot = BACKUP_ROOT,
    clock = () => new Date(),
    commandRunner = runCommand,
    wranglerExecutable = WRANGLER_EXECUTABLE,
  } = {}
) {
  const startedAt = clock().toISOString()
  parseConfirmedDatabaseId(args)
  if (!existsSync(path.join(repositoryRoot, CONFIG_PATH))) {
    throw new Error(`固定Wrangler設定が見つかりません: ${CONFIG_PATH}`)
  }
  if (!existsSync(wranglerExecutable)) {
    throw new Error(`固定Wrangler実行ファイルが見つかりません: ${wranglerExecutable}`)
  }

  const wranglerVersion = normalizeWranglerVersion(
    commandRunner(wranglerExecutable, ['--version'], {
      label: 'Wranglerバージョン検証',
    })
  )
  const gitHeadSha = normalizeGitHeadSha(
    commandRunner('git', ['rev-parse', 'HEAD'], { label: 'Git HEAD SHA取得' })
  )

  const databaseListOutput = commandRunner(
    wranglerExecutable,
    buildDatabaseListArguments(),
    { label: 'D1一覧の取得' }
  )
  const database = selectProductionDatabase(parseJson(databaseListOutput, 'D1一覧'))

  const previousUmask = process.umask(0o077)
  try {
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 })
    chmodSync(backupRoot, 0o700)
    const backupDirectory = path.join(backupRoot, createTimestamp(new Date(startedAt)))
    mkdirSync(backupDirectory, { mode: 0o700 })
    chmodSync(backupDirectory, 0o700)

    let restoreDirectory
    try {
      const timeTravelOutput = commandRunner(wranglerExecutable, buildTimeTravelArguments(), {
        label: 'Time Travel情報の取得',
      })
      const parsedTimeTravel = parseJson(timeTravelOutput, 'Time Travel情報')
      const { bookmark } = normalizeTimeTravelInfo(parsedTimeTravel)
      const timeTravelPartPath = path.join(backupDirectory, 'time-travel.json.part')
      const timeTravelPath = path.join(backupDirectory, 'time-travel.json')
      writePrivateFile(timeTravelPartPath, `${JSON.stringify(parsedTimeTravel, null, 2)}\n`)
      renameSync(timeTravelPartPath, timeTravelPath)
      chmodSync(timeTravelPath, 0o600)

    const sqlPartPath = path.join(backupDirectory, 'score-splitter.sql.part')
    const sqlPath = path.join(backupDirectory, 'score-splitter.sql')
    commandRunner(wranglerExecutable, buildExportArguments(sqlPartPath), {
      label: '本番D1の全量export',
    })
    if (!existsSync(sqlPartPath)) {
      throw new Error('バックアップSQLの.partファイルが作成されませんでした')
    }
    chmodSync(sqlPartPath, 0o600)
    validateBackupSql(readFileSync(sqlPartPath, 'utf8'))
    renameSync(sqlPartPath, sqlPath)
    chmodSync(sqlPath, 0o600)

    const remoteCountOutput = commandRunner(
      wranglerExecutable,
      buildRemoteCountArguments(),
      {
        label: '本番D1のテーブル件数取得',
      }
    )
    const remoteCounts = normalizeRemoteCounts(
      parseJson(remoteCountOutput, '本番D1テーブル件数')
    )

    restoreDirectory = mkdtempSync(path.join(tmpdir(), 'score-splitter-backup-verify-'))
    chmodSync(restoreDirectory, 0o700)
    const restoreDatabasePath = path.join(restoreDirectory, 'restored.sqlite')
    commandRunner('sqlite3', buildSqliteRestoreArguments(restoreDatabasePath), {
      input: readFileSync(sqlPath),
      label: 'SQLiteへのバックアップ復元',
    })
    chmodSync(restoreDatabasePath, 0o600)
    const integrityCheck = commandRunner(
      'sqlite3',
      ['-safe', restoreDatabasePath, 'PRAGMA integrity_check;'],
      { label: 'SQLite integrity_check' }
    ).trim()
    const localCountOutput = commandRunner(
      'sqlite3',
      ['-safe', '-json', restoreDatabasePath, `${countSql};`],
      { label: '復元SQLiteのテーブル件数取得' }
    )
    const localCounts = normalizeLocalCounts(
      parseJson(localCountOutput, '復元SQLiteテーブル件数')
    )
    verifyMatchingCounts(remoteCounts, localCounts)

    const sqlStats = statSync(sqlPath)
    const completedAt = clock().toISOString()
    const manifest = buildManifest(
      {
        startedAt,
        completedAt,
        gitHeadSha,
        wranglerVersion,
        database,
        bookmark,
        sqlPath,
        sqlBytes: sqlStats.size,
        sqlSha256: sha256File(sqlPath),
        remoteCounts,
        localCounts,
        integrityCheck,
      },
      { backupRoot }
    )
    validateReleaseManifest(manifest, {
      expectedGitHeadSha: gitHeadSha,
      now: completedAt,
      backupRoot,
    })
    const manifestPartPath = path.join(backupDirectory, 'manifest.json.part')
    const manifestPath = path.join(backupDirectory, 'manifest.json')
    writePrivateFile(manifestPartPath, `${JSON.stringify(manifest, null, 2)}\n`)
    validateManifest(parseJson(readFileSync(manifestPartPath, 'utf8'), 'manifest'), {
      backupRoot,
    })
    const finalization = finalizeBackupFiles({
      manifestPartPath,
      manifestPath,
      restoreDirectory,
    })
    restoreDirectory = undefined

      return { backupDirectory, manifestPath, ...finalization }
    } catch (error) {
      if (restoreDirectory !== undefined) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\n検証失敗時の一時SQLite: ${restoreDirectory}`,
          { cause: error }
        )
      }
      throw error
    }
  } finally {
    process.umask(previousUmask)
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  try {
    if (process.argv[2] === '--verify-release-manifest') {
      const result = runReleaseBackupVerification()
      console.log(`本番D1バックアップ実体の再検証 PASS: ${result.manifestPath}`)
    } else {
      const result = runProductionBackup()
      console.log(`本番D1バックアップ検証 PASS: ${result.backupDirectory}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
