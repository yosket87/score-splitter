import { decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose'
import { createFirebaseKeyResolver, fetchFirebaseJson, isRecord, type FirebaseVerificationDependencies } from './firebase-keys'

export type FirebaseVerificationStage = 'input' | 'header' | 'keys' | 'signature' | 'claims' | 'account'

export class FirebaseVerificationError extends Error {
  constructor(readonly stage: FirebaseVerificationStage) {
    super('Firebase認証を確認できませんでした')
  }
}

export type FirebaseProvider = 'google.com' | 'apple.com'
export interface VerifiedFirebaseIdentity {
  projectId: string
  uid: string
  provider: FirebaseProvider
  email: string | null
  authTime: number
  issuedAt: number
  expiresAt: number
}
export interface FirebaseVerificationConfig { projectId: string; apiKey: string }

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function identityFromClaims(payload: JWTPayload, projectId: string, now: number): VerifiedFirebaseIdentity {
  const { sub, iat, exp, auth_time: authTime, firebase } = payload
  if (payload.aud !== projectId || typeof sub !== 'string' || sub.length === 0 || sub.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(sub) || !isTimestamp(iat) || !isTimestamp(exp) || !isTimestamp(authTime) ||
    (Object.hasOwn(payload, 'email') && (typeof payload.email !== 'string' || payload.email.length === 0 || payload.email_verified !== true)) ||
    iat > now || authTime > now || authTime > iat || exp <= iat ||
    !isRecord(firebase) || Object.hasOwn(firebase, 'tenant') ||
    (firebase.sign_in_provider !== 'google.com' && firebase.sign_in_provider !== 'apple.com')) {
    throw new Error('Firebaseトークンの内容が不正です')
  }
  return { projectId, uid: sub, provider: firebase.sign_in_provider,
    email: typeof payload.email === 'string' ? payload.email : null,
    authTime, issuedAt: iat, expiresAt: exp }
}

async function checkAccount(
  token: string, identity: VerifiedFirebaseIdentity, config: FirebaseVerificationConfig,
  dependencies: FirebaseVerificationDependencies, deadline: number,
) {
  const remainingBudgetMs = deadline - dependencies.now()
  if (remainingBudgetMs <= 0) throw new Error('Firebase検証期限を超過しました')
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config.apiKey)}`
  const { data } = await fetchFirebaseJson(dependencies, url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  }, remainingBudgetMs)
  if (!isRecord(data) || !Array.isArray(data.users) || data.users.length !== 1) throw new Error('Firebaseアカウントが不正です')
  const user: unknown = data.users[0]
  if (!isRecord(user) || user.localId !== identity.uid || user.disabled === true ||
    (user.disabled !== undefined && typeof user.disabled !== 'boolean') || Object.hasOwn(user, 'tenantId')) {
    throw new Error('Firebaseアカウントが無効です')
  }
  // 省略は失効境界未設定。設定済みの場合は再発行時刻でなく認証時刻と比較する。
  if (user.validSince !== undefined) {
    if (typeof user.validSince !== 'string' || !/^\d+$/.test(user.validSince) ||
      !Number.isSafeInteger(Number(user.validSince)) || identity.authTime < Number(user.validSince)) {
      throw new Error('Firebase認証が失効しています')
    }
  }
}

function createVerifier(dependencies: FirebaseVerificationDependencies) {
  const resolveKey = createFirebaseKeyResolver(dependencies)
  return async (token: string, config: FirebaseVerificationConfig): Promise<VerifiedFirebaseIdentity> => {
    let stage: FirebaseVerificationStage = 'input'
    try {
      const deadline = dependencies.now() + 10000
      if (typeof token !== 'string' || token.length === 0 || token.length > 16 * 1024 ||
        !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId) || !config.apiKey || config.apiKey.length > 256) {
        throw new Error('Firebase検証入力が不正です')
      }
      stage = 'header'
      const header = decodeProtectedHeader(token)
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0 || header.kid.length > 256) {
        throw new Error('Firebaseトークンヘッダーが不正です')
      }
      stage = 'keys'
      const key = await resolveKey(header.kid)
      stage = 'signature'
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'], issuer: `https://securetoken.google.com/${config.projectId}`,
        audience: config.projectId, currentDate: new Date(dependencies.now()),
        requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
      })
      stage = 'claims'
      const identity = identityFromClaims(payload, config.projectId, Math.floor(dependencies.now() / 1000))
      stage = 'account'
      await checkAccount(token, identity, config, dependencies, deadline)
      return identity
    } catch {
      // 通信URL・トークン・外部エラー本文は呼び出し元へ漏らさない。
      throw new FirebaseVerificationError(stage)
    }
  }
}

// テスト用の明示的入口。通常の認証設定には通信先やmock切替を持たせない。
export function createFirebaseTokenVerifierForTesting(dependencies: FirebaseVerificationDependencies) {
  return createVerifier(dependencies)
}

const productionVerifier = createVerifier({ fetch: (input, init) => fetch(input, init), now: () => Date.now() })
export function verifyFirebaseToken(token: string, config: FirebaseVerificationConfig): Promise<VerifiedFirebaseIdentity> {
  return productionVerifier(token, config)
}
