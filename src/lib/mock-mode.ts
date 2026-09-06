// productionビルドではNODE_ENVの静的置換でも閉じる。設定不足からのfallbackには使わない。
export function isDevelopmentMockEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs' && process.env.USE_MOCKS === 'true'
}
export function isLocalMockRequest(request: Request): boolean {
  if (!isDevelopmentMockEnabled()) return false
  const origin = 'http://localhost:3000'
  return new URL(request.url).origin === origin && (!request.headers.has('origin') || request.headers.get('origin') === origin)
}
