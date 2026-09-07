import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

export default function config(phase: string): NextConfig {
  // 設定評価時はNEXT_RUNTIMEが未確定。NextのphaseでMSWとのfetch競合を避ける。
  if (phase === PHASE_DEVELOPMENT_SERVER && process.env.USE_MOCKS !== 'true') initOpenNextCloudflareForDev()
  // Next.jsの開発ログもServer Action引数を記録しない（Firebase ID tokenを含むため）。
  return { logging: { serverFunctions: false, incomingRequests: { ignore: [/\/api\/auth\/google\//, /\/api\/mock\/google\//] } }, headers: async () => [
    { source: '/auth/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'no-store' }] },
  ] }
}
