const callback = 'http://localhost:3000/api/auth/google/callback'
export const googleScenarios = ['member-a', 'member-b', 'pending-a', 'recovery', 'cancel'] as const
export const googlePreparations = [...googleScenarios, 'approve-pending', 'approve-recovery', 'expire-pending'] as const
interface Authorization { parameters: string; scenario: string; expiresAt: number }
interface ProviderState { requests: Map<string, Authorization>; codes: Map<string, Authorization>; keys?: Promise<CryptoKeyPair> }
const shared = globalThis as typeof globalThis & { __googleProvider?: ProviderState }
function state(): ProviderState { return shared.__googleProvider ??= { requests: new Map(), codes: new Map() } }
export function resetGoogleProvider() { state().requests.clear(); state().codes.clear() }
function keys() {
  return state().keys ??= crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
}
function base64url(value: Uint8Array) { return btoa(String.fromCharCode(...value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') }
function encoded(value: unknown) { return base64url(new TextEncoder().encode(JSON.stringify(value))) }
export function localAuthorization(url: string, scenario = 'member-a'): string {
  const parsed = new URL(url)
  if (parsed.origin !== 'https://accounts.google.com' || parsed.searchParams.get('redirect_uri') !== callback
    || parsed.searchParams.get('client_id') !== 'local-google-client' || !googleScenarios.includes(scenario as typeof googleScenarios[number])) throw new Error('認証を開始できません')
  const reference = crypto.randomUUID()
  state().requests.set(reference, { parameters: parsed.search, scenario, expiresAt: Date.now() + 600000 })
  return `http://localhost:3000/api/mock/google/authorize?request=${reference}`
}
export function authorizeGoogleMock(reference: string): string {
  const authorization = state().requests.get(reference)
  state().requests.delete(reference)
  if (!authorization || authorization.expiresAt <= Date.now()) throw new Error('認証要求の期限が切れています')
  const parameters = new URLSearchParams(authorization.parameters)
  const result = new URL(callback)
  result.searchParams.set('state', parameters.get('state')!)
  result.searchParams.set('iss', 'https://accounts.google.com')
  if (authorization.scenario === 'cancel') result.searchParams.set('error', 'access_denied')
  else {
    const code = crypto.randomUUID()
    state().codes.set(code, authorization)
    result.searchParams.set('code', code)
  }
  return result.href
}
export const mockGoogleFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.href === 'https://www.googleapis.com/oauth2/v3/certs') {
    const publicKey = await crypto.subtle.exportKey('jwk', (await keys()).publicKey)
    return Response.json({ keys: [{ ...publicKey, kid: 'local-google-key', use: 'sig', alg: 'RS256' }] })
  }
  if (url.href !== 'https://oauth2.googleapis.com/token' || request.method !== 'POST') throw new Error('未定義の認証通信です')
  const body = new URLSearchParams(await request.text())
  const authorization = state().codes.get(body.get('code') ?? '')
  state().codes.delete(body.get('code') ?? '')
  if (!authorization || authorization.expiresAt <= Date.now()) return Response.json({ error: 'invalid_grant' }, { status: 400 })
  const parameters = new URLSearchParams(authorization.parameters)
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier') ?? ''))))
  if (body.get('client_id') !== 'local-google-client' || body.get('client_secret') !== 'local-google-secret'
    || body.get('redirect_uri') !== callback || body.get('grant_type') !== 'authorization_code' || challenge !== parameters.get('code_challenge')) {
    return Response.json({ error: 'invalid_grant' }, { status: 400 })
  }
  const subject = authorization.scenario === 'recovery' ? 'replacement-a' : authorization.scenario
  const issued = Math.floor(Date.now() / 1000)
  const payload = { iss: 'https://accounts.google.com', sub: subject, aud: 'local-google-client', iat: issued, exp: issued + 300,
    nonce: parameters.get('nonce'), email: `${subject}.very-long-account-name-for-layout@example.com`, email_verified: true }
  const unsigned = `${encoded({ alg: 'RS256', kid: 'local-google-key' })}.${encoded(payload)}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', (await keys()).privateKey, new TextEncoder().encode(unsigned))
  return Response.json({ token_type: 'Bearer', access_token: 'local-only-access', expires_in: 300, id_token: `${unsigned}.${base64url(new Uint8Array(signature))}` })
}
