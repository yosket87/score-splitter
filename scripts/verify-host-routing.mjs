// ホストベースルーティングのローカル検証スクリプト（使い捨て）
// 使い方: npm run dev:mock を起動した状態で `node scripts/verify-host-routing.mjs`
// 注意: fetch(undici)はHostヘッダを送信できないため node:http を使う
import http from 'node:http'

function request(path, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'GET',
        headers: host ? { Host: host } : {},
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () =>
          resolve({ status: res.statusCode, location: res.headers.location ?? null, body })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

const cases = [
  {
    name: 'apex / → LPをrewrite表示（200, LPタイトル含む）',
    host: 'yamawake.app',
    path: '/',
    expect: (res) => res.status === 200 && res.body.includes('ヤマワケ'),
  },
  {
    name: 'apex /lp → 308 https://yamawake.app/',
    host: 'yamawake.app',
    path: '/lp',
    expect: (res) => res.status === 308 && res.location === 'https://yamawake.app/',
  },
  {
    name: 'apex /login → 307 https://app.yamawake.app/login',
    host: 'yamawake.app',
    path: '/login',
    expect: (res) => res.status === 307 && res.location === 'https://app.yamawake.app/login',
  },
  {
    name: 'apex /2026/02?tab=expense → 307（クエリ保持）',
    host: 'yamawake.app',
    path: '/2026/02?tab=expense',
    expect: (res) =>
      res.status === 307 && res.location === 'https://app.yamawake.app/2026/02?tab=expense',
  },
  {
    name: 'app /lp → 308 https://yamawake.app/',
    host: 'app.yamawake.app',
    path: '/lp',
    expect: (res) => res.status === 308 && res.location === 'https://yamawake.app/',
  },
  {
    name: 'app / cookieなし → /login へredirect',
    host: 'app.yamawake.app',
    path: '/',
    expect: (res) => res.status === 307 && res.location?.endsWith('/login') === true,
  },
  {
    name: 'localhost /lp → 素通し200',
    host: null,
    path: '/lp',
    expect: (res) => res.status === 200,
  },
  {
    name: 'apex /lp/monthly-dashboard-preview.png → 200（redirectされない）',
    host: 'yamawake.app',
    path: '/lp/monthly-dashboard-preview.png',
    expect: (res) => res.status === 200,
  },
]

let failed = 0
for (const c of cases) {
  const res = await request(c.path, c.host)
  const ok = c.expect(res)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name} (status=${res.status}, location=${res.location})`)
  if (!ok) failed += 1
}

process.exit(failed === 0 ? 0 : 1)
