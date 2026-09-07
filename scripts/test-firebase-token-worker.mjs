import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'firebase-token-worker-'))
let worker
try {
  const output = join(temporaryDirectory, 'firebase-token.mjs')
  await build({
    entryPoints: [join(root, 'scripts/fixtures/firebase-token-worker.ts')],
    bundle: true, platform: 'browser', format: 'esm', outfile: output,
  })
  // Node互換フラグなしで本番検証関数と同じWebCrypto処理を実行する。
  worker = new Miniflare({
    modules: true, script: await readFile(output, 'utf8'), compatibilityDate: '2026-07-08',
    outboundService: () => { throw new Error('この試験は外部通信を許可しない') },
  })
  const response = await worker.dispatchFetch('https://firebase-test.example/')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    validIdentity: {
      projectId: 'fixture-project', uid: 'firebase-uid-123', provider: 'google.com', email: 'person@example.com',
      authTime: 1799999980, issuedAt: 1799999990, expiresAt: 1800003600,
    },
    invalidSignature: 'rejected',
  })
  console.log('Firebase workerd検証成功: 実RS256署名とX509鍵の受理・改竄拒否（外部通信なし）')
} finally {
  await worker?.dispose()
  await rm(temporaryDirectory, { recursive: true, force: true })
}
