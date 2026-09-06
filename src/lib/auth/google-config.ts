import 'server-only'
import { isDevelopmentMockEnabled } from '@/lib/mock-mode'
import type { GoogleOAuthConfig } from './google-protocol'

export function googleOAuthConfig(): GoogleOAuthConfig | null {
  if (isDevelopmentMockEnabled()) return { clientId: 'local-google-client', clientSecret: 'local-google-secret', redirectUri: 'http://localhost:3000/api/auth/google/callback' }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const origin: string | undefined = process.env.GOOGLE_OAUTH_ORIGIN
  if (!clientId?.trim() || !clientSecret?.trim() || !origin) return null
  try {
    const url = new URL(origin)
    const localDevelopment = process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs'
      && origin === 'http://localhost:3000'
    if (url.origin !== origin || (url.protocol !== 'https:' && !localDevelopment)) return null
    return { clientId, clientSecret, redirectUri: `${origin}/api/auth/google/callback` }
  } catch { return null }
}
export function requestMatchesGoogleOrigin(request: Request, config: GoogleOAuthConfig): boolean {
  const expected = new URL(config.redirectUri).origin
  return new URL(request.url).origin === expected && (!request.headers.has('origin') || request.headers.get('origin') === expected)
}
