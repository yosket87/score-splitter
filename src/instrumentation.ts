/**
 * Next.js Instrumentation
 * サーバー起動時にMSWを初期化する（USE_MOCKS=true の場合のみ）
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.USE_MOCKS === 'true') {
    const { server } = await import('./mocks/server')
    server.listen({
      onUnhandledRequest: 'bypass',
    })
  }
}
