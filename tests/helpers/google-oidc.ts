// 外部Google通信だけを置き換える。JWT生成・署名検証は実WebCryptoを使う。
export const googleFixtureConfig = {
  clientId: 'test-client.apps.googleusercontent.com',
  clientSecret: 'fixture-client-secret',
  redirectUri: 'https://app.example.com/api/auth/google/callback',
}

export function googleCallbackUrl(state: string): string {
  const url = new URL(googleFixtureConfig.redirectUri)
  url.search = new URLSearchParams({ state, code: 'fixture-code', iss: 'https://accounts.google.com' }).toString()
  return url.href
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

let signingKeys: Promise<CryptoKeyPair> | undefined
function getSigningKeys() {
  signingKeys ??= crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
  }, true, ['sign', 'verify'])
  return signingKeys
}

export async function createGoogleOidcFixture(
  attempt: { nonce: string; codeVerifier: string },
  options: { claims?: Record<string, unknown>; invalidSignature?: boolean; omitIdToken?: boolean; algorithm?: string } = {},
) {
  const keys = await getSigningKeys()
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: 'https://accounts.google.com', sub: 'google-subject-123', aud: googleFixtureConfig.clientId,
    iat: now, exp: now + 3600, nonce: attempt.nonce,
    email: 'person@example.com', email_verified: true, ...options.claims,
  }
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)))
  const input = `${encode({ alg: options.algorithm ?? 'RS256', kid: 'fixture-key', typ: 'JWT' })}.${encode(claims)}`
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input)))
  if (options.invalidSignature) signature[0] ^= 0xff
  const idToken = `${input}.${base64url(signature)}`
  const requests: { url: string; init?: RequestInit }[] = []
  const fetcher = async (inputUrl: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(inputUrl)
    requests.push({ url, init })
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
      return Response.json({ keys: [{ ...publicJwk, kid: 'fixture-key', use: 'sig', alg: 'RS256' }] })
    }
    if (url !== 'https://oauth2.googleapis.com/token') throw new Error('予期しない通信先')
    const body = new URLSearchParams(String(init?.body))
    const expected = {
      client_id: googleFixtureConfig.clientId, client_secret: googleFixtureConfig.clientSecret,
      redirect_uri: googleFixtureConfig.redirectUri, grant_type: 'authorization_code',
      code: 'fixture-code', code_verifier: attempt.codeVerifier,
    }
    if (init?.method !== 'POST' || Object.entries(expected).some(([key, value]) => body.get(key) !== value)) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    return Response.json({
      access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 3600, scope: 'openid email',
      ...(options.omitIdToken ? {} : { id_token: idToken }),
    })
  }
  return { fetch: fetcher, requests, idToken }
}
