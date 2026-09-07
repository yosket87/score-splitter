import { NextRequest, NextResponse } from 'next/server'
import { createGoogleAuthorizationRequest } from '@/lib/auth/google-protocol'
import { googleOAuthConfig, requestMatchesGoogleOrigin } from '@/lib/auth/google-config'
import { attemptCookie, authCookieOptions, authUnavailable, privateResponse, clearAttempt } from '@/lib/auth/google-cookies'
import { createOAuthAttempt, expireOAuthAttempts } from '@/lib/api/google-auth'
import { isDevelopmentMockEnabled } from '@/lib/mock-mode'
import { randomSecret } from '../../../../../../cloudflare/worker/src/google-auth-shared'

export async function GET(request: NextRequest) {
  const config = googleOAuthConfig()
  if (!config || !requestMatchesGoogleOrigin(request, config)) return authUnavailable()
  try {
    await expireOAuthAttempts()
    const authorization = await createGoogleAuthorizationRequest(config)
    const binding = randomSecret()
    const attempt = await createOAuthAttempt({ state: authorization.state, nonce: authorization.nonce, codeVerifier: authorization.codeVerifier, browserBinding: binding })
    let location = authorization.authorizationUrl
    if (isDevelopmentMockEnabled()) {
      const { localAuthorization } = await import('@/mocks/google-provider')
      location = localAuthorization(authorization.authorizationUrl, request.cookies.get('google_mock_scenario')?.value)
    }
    const response = privateResponse(NextResponse.redirect(location, 303))
    response.cookies.set(attemptCookie, JSON.stringify({ id: attempt.attemptId, binding }), authCookieOptions(600))
    return response
  } catch {
    return privateResponse(clearAttempt(NextResponse.redirect(new URL('/login?google=error', config.redirectUri), 303)))
  }
}
