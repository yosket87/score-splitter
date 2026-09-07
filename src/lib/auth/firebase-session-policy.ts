import type { VerifiedFirebaseIdentity } from './firebase-token'

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
