import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
  const helperOutput = join(temporaryDirectory, 'firebase-fixture.mjs')
  await build({ entryPoints: [join(root, 'tests/helpers/firebase-token.ts')],
    bundle: true, platform: 'node', format: 'esm', outfile: helperOutput })
  const { createFirebaseFixtureFetch } = await import(pathToFileURL(helperOutput).href)
  const fixture = createFirebaseFixtureFetch()
  let redirectTarget
  let redirectStatus = 302
  const requests = []
  // Node互換フラグなしで本番検証関数と同じWebCrypto処理を実行する。
  worker = new Miniflare({
    modules: true, script: await readFile(output, 'utf8'), compatibilityDate: '2026-07-08',
    outboundService: async request => {
      requests.push(request.url)
      if (request.url.includes('attacker.example')) throw new Error('リダイレクトを追従しました')
      if (redirectTarget && request.url.includes(redirectTarget)) {
        return new Response(null, { status: redirectStatus, headers: { location: 'https://attacker.example/' } })
      }
      return fixture.fetch(request.url, { method: request.method, headers: request.headers })
    },
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
  for (const [target, stage] of [['/x509/', 'keys'], ['accounts:lookup', 'account']]) {
    redirectTarget = target
    for (const status of [301, 302, 303, 307, 308]) {
      redirectStatus = status
      const rejected = await worker.dispatchFetch('https://firebase-test.example/reject')
      assert.equal(rejected.status, 200)
      assert.deepEqual(await rejected.json(), { rejected: true, stage })
    }
  }
  assert.equal(requests.some(url => url.includes('attacker.example')), false)
  console.log('Firebase workerd検証成功: 実RS256署名とX509鍵の受理・改竄拒否（外部通信なし）')
} finally {
  await worker?.dispose()
  await rm(temporaryDirectory, { recursive: true, force: true })
}
