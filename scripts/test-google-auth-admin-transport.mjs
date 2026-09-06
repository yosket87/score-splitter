import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runWrangler } from './google-auth-admin.mjs'

// 実Wranglerのremote query経路をloopback合成APIへ向ける。Cloudflareには接続しない。
const directory = await mkdtemp(join(tmpdir(), 'google-admin-query-'))
const calls = []
const server = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  calls.push({ method: request.method, path: request.url, body })
  response.setHeader('content-type', 'application/json')
  if (request.url?.endsWith('/query')) {
    const { sql } = JSON.parse(body)
    assert.equal(sql, "SELECT 'private-code' AS value")
    response.end(JSON.stringify({ success: true, errors: [], messages: [], result: [{ success: true, results: [{ value: 'private-code' }], meta: { changes: 0 } }] }))
  } else { response.statusCode = 500; response.end(JSON.stringify({ success: false, errors: [{ message: '未定義のfixture endpoint' }] })) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const old = { ...process.env }
try {
  process.env.CLOUDFLARE_API_BASE_URL = `http://127.0.0.1:${server.address().port}`
  process.env.CLOUDFLARE_API_TOKEN = 'local-fixture-token'
  process.env.CLOUDFLARE_ACCOUNT_ID = '00000000000000000000000000000000'
  const config = join(directory, 'wrangler.json')
  const sql = join(directory, 'query.sql')
  await writeFile(config, JSON.stringify({ name: 'local-fixture', d1_databases: [{ binding: 'DB', database_name: 'local-fixture', database_id: '00000000-0000-4000-8000-000000000000' }] }))
  await writeFile(sql, "SELECT 'private-code' AS value", { mode: 0o600 })
  const result = await runWrangler(['d1', 'execute', 'DB', '--config', config, '--remote', '--yes', '--json', '--file', sql])
  assert.equal(result[0].results[0].value, 'private-code')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.match(calls[0].path, /\/query$/)
  console.log('運営CLI転送検証成功: 実Wrangler remote query・SELECT行保持・loopbackのみ')
} finally {
  process.env = old
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
