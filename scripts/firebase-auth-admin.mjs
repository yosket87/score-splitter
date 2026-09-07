import { readFile, stat, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { parseArguments, verifyDatabase, runWrangler, createWranglerDatabase, writeInspection } from './google-auth-admin.mjs'
export { parseArguments, verifyDatabase, createWranglerDatabase, writeInspection } from './google-auth-admin.mjs'
const safeFailure=()=>new Error('承認できませんでした。対象環境・入力・認証状態を確認してください。')
export async function approveFromVerifiedRequest(db,domain,command,input) {
 const pending=await db.prepare('SELECT project_id,uid FROM firebase_migration_requests WHERE id=?').bind(input.requestId).first()
 if(!pending?.project_id||!pending.uid)throw safeFailure()
 const runtime={now:()=>new Date(),randomUUID:()=>crypto.randomUUID()}
 if(command==='approve-migration')return domain.approveFirebaseMigration(db,runtime,input)
 if(command==='approve-recovery')return domain.approveFirebaseRecovery(db,runtime,input)
 throw safeFailure()
}
export async function inspectRequest(db,input) {
 if(!input||typeof input.code!=='string'||!/^[a-f0-9]{64}$/.test(input.code)||typeof input.householdId!=='string'||!input.householdId.trim())throw safeFailure()
 const requests=(await db.prepare(`SELECT id AS requestId,purpose,status,email,created_at AS createdAt,expires_at AS expiresAt
 FROM firebase_migration_requests WHERE code_hash=?`).bind(createHash('sha256').update(input.code).digest('hex')).all()).results
 if(requests.length!==1)throw safeFailure()
 const existingPeople=(await db.prepare(`SELECT u.id AS userId,u.active,u.session_epoch AS sessionEpoch,m.household_id AS householdId,
 m.default_person AS defaultPerson,m.revoked_at AS membershipRevokedAt,i.id AS identityId,i.email,i.revoked_at AS identityRevokedAt
 FROM users u JOIN household_memberships m ON m.user_id=u.id LEFT JOIN firebase_identities i ON i.user_id=u.id
 WHERE m.household_id=? ORDER BY u.id,i.created_at`).bind(input.householdId).all()).results
 return {requests,existingPeople}
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
  const directory = await mkdtemp(join(tmpdir(), 'firebase-auth-admin-'))
  try {
    const db = createWranglerDatabase(target, options.environment, directory)
    if (options.command === 'inspect') {
      await writeInspection(options.outputFile, await inspectRequest(db, input))
      return '確認情報を指定の非公開ファイルへ保存しました。既存の本人確認記録と照合してください。'
    }
    const outfile = join(directory, 'domain.mjs')
    const { build } = await import('esbuild')
    await build({ entryPoints: [resolve('cloudflare/worker/src/firebase-migrations.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' })
    const domain = await import(pathToFileURL(outfile).href)
    await approveFromVerifiedRequest(db, domain, options.command, input)
    // code/subject/email/本人確認参照やWrangler出力は表示しない。
    return `承認が完了しました（${options.environment}）。本人にFirebaseでの再ログインを案内してください。`
  } finally { await rm(directory, { recursive: true, force: true }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(message => process.stdout.write(`${message}\n`)).catch(() => {
    process.stderr.write(`${safeFailure().message}\n`)
    process.exitCode = 1
  })
}
