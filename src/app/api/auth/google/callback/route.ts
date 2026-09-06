import { isDevelopmentMockEnabled } from '@/lib/mock-mode'
import { GoogleAuthError } from '../../../../../../cloudflare/worker/src/google-auth-shared'
import { NextRequest, NextResponse } from 'next/server'
import { verifyGoogleCallback, GoogleOAuthError } from '@/lib/auth/google-protocol'
import { googleOAuthConfig, requestMatchesGoogleOrigin } from '@/lib/auth/google-config'
import { attemptCookie, attemptCookieSchema, migrationCookie, authCookieOptions, authUnavailable, privateResponse, clearAttempt, parseCookie } from '@/lib/auth/google-cookies'
import { claimOAuthAttempt, completeGoogleLogin, failOAuthAttempt, type OAuthClaim } from '@/lib/api/google-auth'
import { verifiedIdentitySchema } from '../../../../../../cloudflare/worker/src/google-auth-shared'
import { setGoogleSessionCookie } from '@/lib/webauthn/session'

export async function GET(request: NextRequest) {
  const config = googleOAuthConfig()
  if (!config || !requestMatchesGoogleOrigin(request, config)) return authUnavailable()
  let claim: OAuthClaim | undefined
  let phase = 'claim'
  const redirect = (path: string) => privateResponse(clearAttempt(NextResponse.redirect(new URL(path, config.redirectUri), 303)))
  try {
    const attempt = parseCookie(request.cookies.get(attemptCookie)?.value, attemptCookieSchema)
    if (!attempt) throw new Error('認証をやり直してください')
    const state = request.nextUrl.searchParams.get('state') ?? ''
    const claimed = await claimOAuthAttempt({ attemptId: attempt.id, state, browserBinding: attempt.binding })
    claim = claimed
    phase = 'verify'
    const identity = await verifyGoogleCallback(config, request.url, { state, nonce: claimed.nonce, codeVerifier: claimed.codeVerifier })
    phase = 'authorize'
    const result = await completeGoogleLogin(claimed, verifiedIdentitySchema.parse(identity))
    if (result.kind === 'authenticated') {
      phase = 'cookie'
      await setGoogleSessionCookie(result.session)
      const response = redirect('/')
      response.cookies.set(migrationCookie, '', authCookieOptions(0))
      return response
    }
    const response = redirect(result.kind === 'recovered' ? '/login?google=recovered' : '/auth/migration')
    response.cookies.set('household_session', '', authCookieOptions(0))
    response.cookies.set(migrationCookie, result.kind === 'migration_pending'
      ? JSON.stringify({ id: result.requestId, secret: result.browserSecret, code: result.code }) : '', authCookieOptions(result.kind === 'migration_pending' ? 1800 : 0))
    return response
  } catch (error) {
    if (isDevelopmentMockEnabled()) {
      const category = error instanceof GoogleOAuthError || error instanceof GoogleAuthError ? error.code : 'callback_failed'
      console.info('Google認証の開発診断', phase, category)
    }
    if (claim) await failOAuthAttempt(claim).catch(() => undefined)
    const response = redirect(error instanceof GoogleOAuthError && error.code === 'access_denied' ? '/login?google=canceled' : '/login?google=error')
    response.cookies.set('household_session', '', authCookieOptions(0))
    return response
  }
}
