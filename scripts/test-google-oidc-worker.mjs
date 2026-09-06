import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'google-oidc-worker-'))
let worker
try {
  const output = join(temporaryDirectory, 'google-oidc.mjs')
  await build({
    entryPoints: [join(root, 'scripts/fixtures/google-oidc-worker.ts')],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    outfile: output,
  })
  // Node互換フラグなしでproductionモジュールをworkerd内で実行する。
  worker = new Miniflare({
    modules: true,
    script: await readFile(output, 'utf8'),
    compatibilityDate: '2026-07-08',
    outboundService: () => { throw new Error('この試験は外部通信を許可しない') },
  })
  const response = await worker.dispatchFetch('https://oidc-test.example/')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    validIdentity: { issuer: 'https://accounts.google.com', subject: 'google-subject-123', email: 'person@example.com' },
    invalidSignature: 'invalid_token',
  })
  console.log('Google OIDC workerd検証成功: 実WebCrypto署名の受理・不正署名の拒否（Google外部通信なし）')
} finally {
  await worker?.dispose()
  await rm(temporaryDirectory, { recursive: true, force: true })
}
