import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, rm, mkdtemp, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Miniflare } from 'miniflare'

// Next/OpenNextのproduction成果物そのものをローカルworkerdで実行する。
const entry = resolve('.open-next/google-auth-test-entry.mjs')
const bundle = await mkdtemp(resolve(tmpdir(), 'google-production-'))
let mf
try {
await writeFile(entry, `import worker from './worker.js'
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './worker.js'
export default { async fetch(request, env, ctx) {
  if (new URL(request.url).pathname === '/__fixture_probe') return Response.json({
    store: !!globalThis.__scoreSplitterMockStore, google: !!globalThis.__googleUiState, provider: !!globalThis.__googleProvider
  })
  // dispatchFetch内部のlocalhost Hostを実URLと一致させ、実配布時のRequest契約を再現する。
  const headers = new Headers(request.headers)
  headers.set('host', new URL(request.url).host)
  return worker.fetch(new Request(request, { headers }), env, ctx)
} }`)
let outbound = 0
// deploy --dry-runは通信・配備せず、WranglerのNode互換shimを含む配布bundleだけを作る。
await promisify(execFile)(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'deploy', entry,
  '--env', 'dev', '--dry-run', '--outdir', bundle], { env: { ...process.env, WRANGLER_LOG_PATH: resolve(bundle, 'wrangler.log'), WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 4 * 1024 * 1024 })
const files = (await readdir(bundle)).filter(path => /\.(?:mjs|js|wasm)$/.test(path))
const modules = files.sort((a, b) => Number(b === 'google-auth-test-entry.js') - Number(a === 'google-auth-test-entry.js'))
  .map(path => ({ type: path.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule', path: resolve(bundle, path) }))
const runtimeOptions = { modules, modulesRoot: bundle,
  compatibilityDate: '2026-06-28', compatibilityFlags: ['nodejs_compat'],
  assets: { directory: resolve('.open-next/assets'), binding: 'ASSETS', routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } },
  d1Databases: { DB: 'google-auth-production-fixture' }, d1Persist: false,
  bindings: { GOOGLE_OAUTH_CLIENT_ID: 'valid-dummy-client', GOOGLE_OAUTH_CLIENT_SECRET: 'valid-dummy-secret',
    GOOGLE_OAUTH_ORIGIN: 'https://app.example.com', USE_MOCKS: 'true', NODE_ENV: 'development', NEXT_RUNTIME: 'nodejs' },
  outboundService: () => { outbound++; return new Response('外部通信は禁止', { status: 502 }) },
}
mf = new Miniflare(runtimeOptions)
  const db = await mf.getD1Database('DB')
  for (const file of (await readdir('cloudflare/worker/migrations')).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec((await readFile(`cloudflare/worker/migrations/${file}`, 'utf8')).replace(/--[^\n]*/g, '').replace(/\s+/g, ' '))
  }
  const headers = { host: 'app.example.com', 'x-forwarded-proto': 'https', cookie: 'google_mock_scenario=member-a', 'content-type': 'application/json' }
  for (const [path, method] of [['/api/mock/reset', 'POST'], ['/api/mock/ai-diagnosis-stats', 'GET'],
    ['/api/mock/google/prepare', 'POST'], ['/api/mock/firebase/prepare', 'POST'], ['/api/mock/google/authorize?request=fixture', 'GET'], ['/api/mock/__google-ui-fixture.html', 'GET']]) {
    const response = await mf.dispatchFetch(`https://app.example.com${path}`, { method, headers, redirect: 'manual', ...(method === 'POST' ? { body: '{"scenario":"member-a"}' } : {}) })
    assert.equal(response.status, 404, `${path}: ${await response.text()}`)
  }
  const login = await mf.dispatchFetch('https://app.example.com/login', { headers, redirect: 'manual' })
  assert.equal(login.status, 200)
  assert.match(await login.text(), /Googleでログイン/)
  const preview = await mf.dispatchFetch('https://dynamic-preview.example.com/api/auth/google/start?mock=1&sub=attacker', { redirect: 'manual', headers: { ...headers, host: 'dynamic-preview.example.com' } })
  assert.equal(preview.status, 400)
  assert.equal(preview.headers.get('location'), null)
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM oauth_login_attempts').first()).n, 0)
  const start = await mf.dispatchFetch('https://app.example.com/api/auth/google/start?mock=1&sub=attacker', { headers, redirect: 'manual' })
  assert.equal(start.status, 303)
  assert.match(start.headers.get('set-cookie'), /Secure/)
  assert.equal(new URL(start.headers.get('location')).origin, 'https://accounts.google.com')
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM oauth_login_attempts').first()).n, 1)
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM sessions').first()).n, 0)
  const probe = await mf.dispatchFetch('https://app.example.com/__fixture_probe')
  assert.deepEqual(await probe.json(), { store: false, google: false, provider: false })
  assert.equal(outbound, 0)
  for (const path of await readdir('.open-next', { recursive: true })) {
    if (!/\.(mjs|js)$/.test(path) || !(await stat(resolve('.open-next', path))).isFile()) continue
    const contents = await readFile(`.open-next/${path}`, 'utf8')
    assert.doesNotMatch(contents, /node:sqlite|from["' ]+miniflare|tests\/helpers\/(?:identity|auth)-sqlite/, path)
  }
  for (const file of files.filter(file => /\.(?:mjs|js)$/.test(file))) {
    assert.doesNotMatch(await readFile(resolve(bundle, file), 'utf8'), /node:sqlite|\bminiflare\b|tests\/helpers\/(?:identity|auth)-sqlite/)
  }
  await mf.dispose()
  mf = new Miniflare({ ...runtimeOptions, bindings: { ...runtimeOptions.bindings,
    FIREBASE_PROJECT_ID: 'fixture-project', FIREBASE_API_KEY: 'public-fixture', FIREBASE_AUTH_DOMAIN: 'fixture-project.firebaseapp.com',
    FIREBASE_AUTH_ORIGIN: 'https://app.example.com', FIREBASE_GOOGLE_ENABLED: 'true', FIREBASE_APPLE_ENABLED: 'true', FIREBASE_AUTH_MOCK: 'true',
  } })
  const firebaseLogin = await mf.dispatchFetch('https://app.example.com/login', { headers })
  assert.equal(firebaseLogin.status, 200)
  const firebaseHtml = await firebaseLogin.text()
  assert.match(firebaseHtml, /Googleでログイン/)
  assert.match(firebaseHtml, /Appleでログイン/)
  assert.doesNotMatch(firebaseHtml, /ローカル画面検証用/)
  const firebaseMock = await mf.dispatchFetch('https://app.example.com/api/mock/firebase/prepare', { method: 'POST', headers, body: '{"scenario":"member-a"}' })
  assert.equal(firebaseMock.status, 404)
  const previousGoogle = await mf.dispatchFetch('https://app.example.com/api/auth/google/start', { headers, redirect: 'manual' })
  assert.equal(previousGoogle.status, 400)
  const firebasePreview = await mf.dispatchFetch('https://dynamic-preview.example.com/login', { headers: { ...headers, host: 'dynamic-preview.example.com' } })
  assert.doesNotMatch(await firebasePreview.text(), /Googleでログイン|Appleでログイン/)
  const migrationPreview = await mf.dispatchFetch('https://dynamic-preview.example.com/auth/migration', { headers: { ...headers, host: 'dynamic-preview.example.com' } })
  assert.doesNotMatch(await migrationPreview.text(), /Googleでログイン|Appleでログイン/)
  assert.deepEqual(await (await mf.dispatchFetch('https://app.example.com/__fixture_probe')).json(), { store: false, google: false, provider: false })
  assert.equal(outbound, 0)
  console.log('production認証封鎖検証成功: Google/Firebase有効設定・全mock入口404・Preview拒否・旧Google停止・Store未初期化・外部通信0')
} finally { await mf?.dispose(); await rm(entry, { force: true }); await rm(bundle, { recursive: true, force: true }) }
