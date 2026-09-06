/**
 * Next.js Instrumentation
 * サーバー起動時にMSWを初期化する（USE_MOCKS=true の場合のみ）
 */

import { isDevelopmentMockEnabled } from './lib/mock-mode'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && isDevelopmentMockEnabled()) {
    const { server } = await import('./mocks/server')
    server.listen({
      onUnhandledRequest(request, print) {
        const host = new URL(request.url).hostname
        if (['mock-worker.local', 'oauth2.googleapis.com', 'www.googleapis.com'].includes(host)) print.error()
      },
    })
  }
}
