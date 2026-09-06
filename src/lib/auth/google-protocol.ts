import * as oauth from 'oauth4webapi'
import { z } from 'zod'

export interface GoogleOAuthConfig {
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
}

export interface GoogleOAuthAttempt {
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
}

export type GoogleOAuthErrorCode = 'invalid_config' | 'invalid_callback' | 'invalid_attempt'
  | 'access_denied' | 'provider_error' | 'invalid_token'

export class GoogleOAuthError extends Error {
  constructor(readonly code: GoogleOAuthErrorCode) {
    super(code)
    this.name = 'GoogleOAuthError'
  }
}

const callbackPath = '/api/auth/google/callback'
const configSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  redirectUri: z.string().url(),
})

function validateConfig(config: GoogleOAuthConfig): URL {
  if (!configSchema.safeParse(config).success) throw new GoogleOAuthError('invalid_config')
  const redirect = new URL(config.redirectUri)
  const secure = redirect.protocol === 'https:'
    || (redirect.protocol === 'http:' && redirect.hostname === 'localhost')
  if (!secure || redirect.username || redirect.password || redirect.pathname !== callbackPath
    || redirect.search || redirect.hash || redirect.href !== config.redirectUri) {
    throw new GoogleOAuthError('invalid_config')
  }
  return redirect
}

export async function createGoogleAuthorizationRequest(config: GoogleOAuthConfig) {
  validateConfig(config)
  const state = oauth.generateRandomState()
  const nonce = oauth.generateRandomNonce()
  const codeVerifier = oauth.generateRandomCodeVerifier()
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
  }).toString()
  return { authorizationUrl: authorizationUrl.href, state, nonce, codeVerifier }
}

// GoogleのDiscoveryから採用した信頼済みendpoint。入力から上書きさせない。
const googleServer: oauth.AuthorizationServer = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  id_token_signing_alg_values_supported: ['RS256'],
  authorization_response_iss_parameter_supported: true,
}

interface GoogleVerificationOptions {
  // サーバー内部での外部通信差し替え専用。HTTP入力から受け取らない。
  readonly fetch?: typeof fetch
}

const attemptSchema = z.object({
  state: z.string().trim().min(1),
  nonce: z.string().trim().min(1),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
})

function validateCallback(
  redirect: URL, callbackUrl: string, attempt: GoogleOAuthAttempt, client: oauth.Client,
): URLSearchParams {
  if (!attemptSchema.safeParse(attempt).success) throw new GoogleOAuthError('invalid_attempt')
  try {
    const callback = new URL(callbackUrl)
    if (callback.origin !== redirect.origin || callback.pathname !== redirect.pathname
      || callback.username || callback.password || callback.hash) {
      throw new GoogleOAuthError('invalid_callback')
    }
    const parameters = oauth.validateAuthResponse(googleServer, client, callback, attempt.state)
    if (parameters.getAll('code').length !== 1 || !parameters.get('code')?.trim()) {
      throw new GoogleOAuthError('invalid_callback')
    }
    return parameters
  } catch (error) {
    if (error instanceof oauth.AuthorizationResponseError) {
      throw new GoogleOAuthError(error.error === 'access_denied' ? 'access_denied' : 'provider_error')
    }
    throw new GoogleOAuthError('invalid_callback')
  }
}

export async function verifyGoogleCallback(
  config: GoogleOAuthConfig,
  callbackUrl: string,
  attempt: GoogleOAuthAttempt,
  options: GoogleVerificationOptions = {},
) {
  const redirect = validateConfig(config)
  const client: oauth.Client = { client_id: config.clientId, id_token_signed_response_alg: 'RS256', [oauth.clockTolerance]: 0 }
  const parameters = validateCallback(redirect, callbackUrl, attempt, client)
  const response = await exchangeCode(config, client, parameters, attempt.codeVerifier, options)
  return verifyTokenResponse(client, response, attempt.nonce, options)
}

async function exchangeCode(
  config: GoogleOAuthConfig, client: oauth.Client, parameters: URLSearchParams,
  codeVerifier: string, options: GoogleVerificationOptions,
): Promise<Response> {
  try {
    return await oauth.authorizationCodeGrantRequest(
      googleServer, client, oauth.ClientSecretPost(config.clientSecret),
      parameters, config.redirectUri, codeVerifier, { [oauth.customFetch]: options.fetch },
    )
  } catch {
    throw new GoogleOAuthError('provider_error')
  }
}

const identitySchema = z.object({
  iss: z.literal('https://accounts.google.com'),
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.literal(true),
})

async function verifyTokenResponse(
  client: oauth.Client, response: Response, nonce: string, options: GoogleVerificationOptions,
): Promise<{ issuer: string; subject: string; email: string }> {
  try {
    const result = await oauth.processAuthorizationCodeResponse(googleServer, client, response, {
      expectedNonce: nonce, requireIdToken: true,
    })
    await oauth.validateApplicationLevelSignature(googleServer, response, { [oauth.customFetch]: options.fetch })
    const claims = oauth.getValidatedIdTokenClaims(result)!
    // ライブラリは複数audience時のみazpを検証するため、単一audienceも確認する。
    if (claims.azp !== undefined && claims.azp !== client.client_id) throw new GoogleOAuthError('invalid_token')
    const identity = identitySchema.parse(claims)
    return { issuer: identity.iss, subject: identity.sub, email: identity.email }
  } catch {
    // 上流の例外はtoken・claims・応答bodyをcauseに持ち得るため引き継がない。
    throw new GoogleOAuthError('invalid_token')
  }
}
