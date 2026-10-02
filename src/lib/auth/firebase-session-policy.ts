import type { VerifiedFirebaseIdentity } from './firebase-token'

// アプリ用セッションの保持期間。本人確認用IDトークンの期限とは独立する。
export const FIREBASE_WEB_SESSION_MAX_AGE = 30 * 24 * 60 * 60
export const FIREBASE_MOBILE_SESSION_MAX_AGE = 365 * 24 * 60 * 60

export interface CurrentFirebaseIdentity { projectId: string; uid: string }

// currentはCookieからDBで検証した有効セッションの本人。クライアント入力を渡さない。
export function canExchangeFirebaseSession(
  identity: VerifiedFirebaseIdentity,
  current: CurrentFirebaseIdentity | null,
  mode: unknown,
  nowSeconds: number,
): boolean {
  if (identity.expiresAt <= nowSeconds || identity.authTime > nowSeconds) return false
  const sameIdentity = current?.projectId === identity.projectId && current.uid === identity.uid
  if (mode === 'refresh') return sameIdentity
  if (mode !== 'login' || (current && !sameIdentity)) return false
  return nowSeconds - identity.authTime <= 300
}
