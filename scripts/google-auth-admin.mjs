import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, stat, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { createHash } from 'node:crypto'
const executeFile = promisify(execFile)
const safeFailure = () => new Error('承認できませんでした。対象環境・入力・認証状態を確認してください。')

export function parseArguments(args) {
  const [command, ...flags] = args
  if (!['approve-migration', 'approve-recovery', 'inspect'].includes(command) || flags.length !== (command === 'inspect' ? 8 : 6)) throw safeFailure()
  const values = new Map()
  for (let i = 0; i < flags.length; i += 2) {
    if (![ '--env', '--confirm-database', '--input-file', ...(command === 'inspect' ? ['--output-file'] : []) ].includes(flags[i]) || values.has(flags[i]) || !flags[i + 1]) throw safeFailure()
    values.set(flags[i], flags[i + 1])
  }
  const environment = values.get('--env')
  if (!['dev', 'production'].includes(environment)) throw safeFailure()
  return { command, environment, databaseId: values.get('--confirm-database'), inputFile: values.get('--input-file'), ...(command === 'inspect' ? { outputFile: values.get('--output-file') } : {}) }
}
export function verifyDatabase(databases, target, confirmation) {
  if (!target || target.database_id !== confirmation || !Array.isArray(databases)
    || databases.filter(row => row.name === target.database_name && row.uuid === confirmation).length !== 1) throw safeFailure()
}
function literal(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (typeof value === 'string' && !value.includes('\0')) return `'${value.replace(/'/g, "''")}'`
  throw safeFailure()
}
// 純粋ドメインのbindをWrangler用SQLファイルへ移す。文字列内の?は置換しない。
export function bindSql(query, values) {
  let quoted = false, index = 0, result = ''
  for (let cursor = 0; cursor < query.length; cursor++) {
    const character = query[cursor]
    if (character === "'") {
      result += character
      if (quoted && query[cursor + 1] === "'") { result += query[++cursor]; continue }
      quoted = !quoted
    } else if (character === '?' && !quoted) {
      if (index >= values.length) throw safeFailure()
      result += literal(values[index++])
    } else result += character
  }
  if (quoted || index !== values.length) throw safeFailure()
  return result
}
export function wranglerInvocation(args) {
  const fileIndex = args.indexOf('--file')
  if (fileIndex < 0) return { args: [resolve('node_modules/wrangler/bin/wrangler.js'), ...args] }
  const sqlFile = args[fileIndex + 1]
  if (!sqlFile) throw safeFailure()
  return { args: ['--import', resolve('scripts/google-auth-wrangler-input.mjs'), resolve('node_modules/wrangler/wrangler-dist/cli.js'),
    ...args.slice(0, fileIndex), ...args.slice(fileIndex + 2)], sqlFile }
}
export async function runWrangler(args) {
  const logs = await mkdtemp(join(tmpdir(), 'google-auth-wrangler-'))
  try {
    const invocation = wranglerInvocation(args)
    const { stdout } = await executeFile(process.execPath, invocation.args,
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 60_000, env: { ...process.env, ...(invocation.sqlFile ? { GOOGLE_AUTH_SQL_FILE: invocation.sqlFile } : {}), WRANGLER_SEND_METRICS: 'false', WRANGLER_SEND_ERROR_REPORTS: 'false', WRANGLER_LOG_SANITIZE: 'true', WRANGLER_LOG_PATH: join(logs, 'private.log') } })
    return JSON.parse(stdout)
  } catch { throw safeFailure() }
  finally { await rm(logs, { recursive: true, force: true }) }
}
export function createWranglerDatabase(target, environment, directory, run = runWrangler) {
  const envArgs = environment === 'dev' ? ['--env', 'dev'] : []
  const query = async (sql, values) => {
    const path = join(directory, `${crypto.randomUUID()}.sql`)
    try {
      await writeFile(path, bindSql(sql, values), { mode: 0o600 })
      const result = await run(['d1', 'execute', target.database_id, '--config', resolve('wrangler.jsonc'), ...envArgs,
        '--remote', '--yes', '--json', '--file', path])
      if (!Array.isArray(result) || result.length !== 1 || result[0].success !== true) throw safeFailure()
      return result[0]
    } catch { throw safeFailure() }
    finally { await rm(path, { force: true }) }
  }
  const statement = (sql, values = []) => ({
    bind: (...parameters) => statement(sql, parameters),
    first: async () => (await query(sql, values)).results?.[0] ?? null,
    all: async () => ({ results: (await query(sql, values)).results ?? [] }),
    run: () => query(sql, values),
  })
  return { prepare: sql => statement(sql), batch: async () => { throw safeFailure() } }
}
export async function approveFromVerifiedRequest(db, domain, command, input) {
  // 主体はoperator入力で置換せず、既にOIDCで検証した申請から読む。
  const pending = await db.prepare('SELECT issuer,subject FROM google_migration_requests WHERE id=?').bind(input.requestId).first()
  if (pending?.issuer !== 'https://accounts.google.com' || !pending.subject) throw safeFailure()
  const runtime = { randomUUID: () => crypto.randomUUID(), now: () => new Date() }
  if (command === 'approve-migration') return domain.approveGoogleMigration(db, runtime, input)
  if (command === 'approve-recovery') return domain.approveGoogleRecovery(db, runtime, input)
  throw safeFailure()
}
export async function inspectRequest(db, input) {
  if (!input || typeof input.code !== 'string' || !/^[a-f0-9]{64}$/.test(input.code)
    || typeof input.householdId !== 'string' || !input.householdId.trim()) throw safeFailure()
  const codeHash = createHash('sha256').update(input.code).digest('hex')
  const requests = (await db.prepare(`SELECT id AS requestId,purpose,status,email,created_at AS createdAt,expires_at AS expiresAt
    FROM google_migration_requests WHERE code_hash=? AND issuer='https://accounts.google.com'`).bind(codeHash).all()).results
  if (requests.length !== 1) throw safeFailure()
  const existingPeople = (await db.prepare(`SELECT u.id AS userId,u.active,u.session_epoch AS sessionEpoch,
    m.household_id AS householdId,m.default_person AS defaultPerson,m.revoked_at AS membershipRevokedAt,
    i.id AS identityId,i.email,i.revoked_at AS identityRevokedAt
    FROM users u JOIN household_memberships m ON m.user_id=u.id
    LEFT JOIN google_identities i ON i.user_id=u.id WHERE m.household_id=? ORDER BY u.id,i.created_at`).bind(input.householdId).all()).results
  return { requests, existingPeople }
}
export async function writeInspection(path, result) {
  // 新規ファイルだけに書き、既存内容や広い権限を引き継がない。
  await writeFile(path, JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' })
}
export async function main(args) {
  const options = parseArguments(args)
  const permissions = await stat(options.inputFile)
  if (!permissions.isFile() || (permissions.mode & 0o077) !== 0) throw safeFailure()
  const input = JSON.parse(await readFile(options.inputFile, 'utf8'))
  const configFile = resolve('wrangler.jsonc')
  const parsed = ts.parseConfigFileTextToJson(configFile, await readFile(configFile, 'utf8'))
  if (parsed.error) throw safeFailure()
  const config = options.environment === 'dev' ? parsed.config.env?.dev : parsed.config
  const target = config?.d1_databases?.find(binding => binding.binding === 'DB')
  if (!target || target.database_id !== options.databaseId) throw safeFailure()
  const databases = await runWrangler(['d1', 'list', '--config', configFile, '--json'])
  verifyDatabase(databases, target, options.databaseId)
  const directory = await mkdtemp(join(tmpdir(), 'google-auth-admin-'))
  try {
    const db = createWranglerDatabase(target, options.environment, directory)
    if (options.command === 'inspect') {
      await writeInspection(options.outputFile, await inspectRequest(db, input))
      return '確認情報を指定の非公開ファイルへ保存しました。既存の本人確認記録と照合してください。'
    }
    const outfile = join(directory, 'domain.mjs')
    const { build } = await import('esbuild')
    await build({ entryPoints: [resolve('cloudflare/worker/src/google-migrations.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' })
    const domain = await import(pathToFileURL(outfile).href)
    await approveFromVerifiedRequest(db, domain, options.command, input)
    // code/subject/email/本人確認参照やWrangler出力は表示しない。
    return `承認が完了しました（${options.environment}）。本人にGoogleでの再ログインを案内してください。`
  } finally { await rm(directory, { recursive: true, force: true }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(message => process.stdout.write(`${message}\n`)).catch(() => {
    process.stderr.write(`${safeFailure().message}\n`)
    process.exitCode = 1
  })
}
