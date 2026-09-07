import { expect, it } from 'vitest'
import { bindSql, verifyDatabase, parseArguments } from '../../../scripts/google-auth-admin.mjs'
it('入力の引用符をSQL値として閉じ、placeholder数の不一致を拒否する', () => {
  expect(bindSql('SELECT ? AS value', ["code'); DELETE FROM users; --"])).toBe("SELECT 'code''); DELETE FROM users; --' AS value")
  expect(() => bindSql('SELECT ?', [])).toThrow()
})
it('envとDB UUIDが完全一致しない場合は操作を許可しない', () => {
  const target = { database_name: 'dev-db', database_id: '11111111-1111-4111-8111-111111111111' }
  expect(() => verifyDatabase([{ name: 'other', uuid: target.database_id }], target, target.database_id)).toThrow()
  expect(() => verifyDatabase([{ name: target.database_name, uuid: target.database_id }], target, 'wrong')).toThrow()
  expect(verifyDatabase([{ name: target.database_name, uuid: target.database_id }], target, target.database_id)).toBeUndefined()
})
it('秘密値はargvに受け付けず入力ファイルと対象確認を必須にする', () => {
  expect(() => parseArguments(['approve-migration', '--env', 'dev', '--code', 'secret'])).toThrow()
  expect(() => parseArguments(['approve-migration', '--env', 'preview'])).toThrow()
  expect(parseArguments(['approve-recovery', '--env', 'dev', '--confirm-database', 'uuid', '--input-file', '/tmp/private.json']))
    .toMatchObject({ command: 'approve-recovery', environment: 'dev', databaseId: 'uuid', inputFile: '/tmp/private.json' })
})

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWranglerDatabase, approveFromVerifiedRequest } from '../../../scripts/google-auth-admin.mjs'
import { vi } from 'vitest'
it('Wranglerには値をargvで渡さず一時SQLファイルだけを渡して削除する', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'admin-transport-test-'))
  const calls: string[][] = []
  try {
    const run = async (args: string[]) => {
      calls.push(args)
      const path = args[args.indexOf('--file') + 1]
      expect(await readFile(path, 'utf8')).toBe("SELECT 'private-code' AS value")
      return [{ success: true, results: [{ value: 'ok' }] }]
    }
    const db = createWranglerDatabase({ database_id: 'fixture-id' }, 'dev', directory, run)
    expect(await db.prepare('SELECT ? AS value').bind('private-code').first()).toEqual({ value: 'ok' })
    expect(calls[0]).toContain('--remote')
    expect(calls[0]).toContain('dev')
    expect(calls[0].join(' ')).not.toContain('private-code')
    expect(await readdir(directory)).toEqual([])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
it('Wrangler失敗時の秘密を隠し一時ファイルを消す', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'admin-failure-test-'))
  try {
    const db = createWranglerDatabase({ database_id: 'fixture-id' }, 'production', directory, async () => { throw new Error('code=private-fixture') })
    const error = await db.prepare('SELECT ?').bind('private-fixture').first().catch(error => error)
    expect(String(error)).not.toContain('private-fixture')
    expect(await readdir(directory)).toEqual([])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
it.each(['approve-migration', 'approve-recovery'])('運営%sは既存の純粋承認関数に接続する', async command => {
  const domain = { approveGoogleMigration: vi.fn().mockResolvedValue({ requestId: 'id' }), approveGoogleRecovery: vi.fn().mockResolvedValue({ requestId: 'id' }) }
  const db = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: async () => ({ issuer: 'https://accounts.google.com', subject: 'verified-subject' }) }) }) }
  const input = { requestId: 'id', code: 'private-code' }
  expect(await approveFromVerifiedRequest(db, domain, command, input)).toEqual({ requestId: 'id' })
  expect(command === 'approve-migration' ? domain.approveGoogleMigration : domain.approveGoogleRecovery).toHaveBeenCalledWith(db, expect.any(Object), input)
})
it('未検証主体の申請は承認関数へ渡さない', async () => {
  const domain = { approveGoogleMigration: vi.fn() }
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ issuer: 'https://untrusted.example', subject: 'fixture' }) }) }) }
  await expect(approveFromVerifiedRequest(db, domain, 'approve-migration', { requestId: 'id' })).rejects.toThrow()
  expect(domain.approveGoogleMigration).not.toHaveBeenCalled()
})

it('quoted placeholderと不正値・閉じていない文字列を誤って展開しない', () => {
  expect(bindSql("SELECT '?' AS q, ? AS value", [null])).toBe("SELECT '?' AS q, NULL AS value")
  expect(bindSql('SELECT ?', [42])).toBe('SELECT 42')
  expect(() => bindSql('SELECT ?', [Infinity])).toThrow()
  expect(() => bindSql('SELECT ?', ['bad\0value'])).toThrow()
  expect(() => bindSql("SELECT 'open ?", ['x'])).toThrow()
  expect(() => bindSql('SELECT 1', ['extra'])).toThrow()
})
it('Wranglerの失敗結果を成功として扱わない', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'admin-result-test-'))
  try {
    const db = createWranglerDatabase({ database_id: 'fixture' }, 'production', directory, async () => [{ success: false, results: [] }])
    await expect(db.prepare('UPDATE fixture SET n=?').bind(1).run()).rejects.toThrow()
    await expect(db.batch()).rejects.toThrow()
    expect(await readdir(directory)).toEqual([])
  } finally { await rm(directory, { recursive: true, force: true }) }
})

import { wranglerInvocation, inspectRequest } from '../../../scripts/google-auth-admin.mjs'
it('remote SELECTはimportでなくquery経路へ秘密をOS argvなしで渡す', () => {
  const invocation = wranglerInvocation(['d1', 'execute', 'fixture', '--remote', '--json', '--file', '/private/query.sql'])
  expect(invocation.args).not.toContain('--file')
  expect(invocation.args).not.toContain('--command')
  expect(invocation.args).toContain('--import')
  expect(invocation.args.some((value: string) => value.endsWith('wrangler-dist/cli.js'))).toBe(true)
  expect(invocation.sqlFile).toBe('/private/query.sql')
})
it('inspectは必須非公開出力先を受け、code hashで申請と既存個人候補だけを読む', async () => {
  expect(parseArguments(['inspect', '--env', 'dev', '--confirm-database', 'id', '--input-file', 'input', '--output-file', 'output']))
    .toMatchObject({ command: 'inspect', outputFile: 'output' })
  const queries: unknown[][] = []
  const db = { prepare: (sql: string) => ({ bind: (...values: unknown[]) => ({ all: async () => {
    queries.push([sql, ...values])
    return { results: sql.includes('code_hash') ? [{ requestId: 'request', email: 'new@example.com' }] : [{ userId: 'existing', sessionEpoch: 2 }] }
  } }) }) }
  const result = await inspectRequest(db, { code: 'a'.repeat(64), householdId: 'household' })
  expect(result).toEqual({ requests: [{ requestId: 'request', email: 'new@example.com' }], existingPeople: [{ userId: 'existing', sessionEpoch: 2 }] })
  expect(JSON.stringify(queries)).not.toContain('a'.repeat(64))
  expect(JSON.stringify(result)).not.toContain('code')
})

import { stat } from 'node:fs/promises'
import { writeInspection } from '../../../scripts/google-auth-admin.mjs'
it('inspect結果は600の新規ファイルのみで既存ファイルを上書きしない', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'admin-inspect-test-'))
  const path = join(directory, 'result.json')
  try {
    await writeInspection(path, { requests: [{ requestId: 'verified' }], existingPeople: [] })
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await expect(writeInspection(path, { requests: [] })).rejects.toThrow()
    expect(JSON.parse(await readFile(path, 'utf8')).requests).toEqual([{ requestId: 'verified' }])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
