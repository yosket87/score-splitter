import type { Person } from './index'

export interface LegacySession {
  person: Person | null
  authMethod: 'password' | 'passkey'
}
export interface GoogleSession {
  person: Person | null
  authMethod: 'google'
  userId: string
  membershipId: string
  sessionEpoch: number
}
export interface FirebaseSession extends Omit<GoogleSession, 'authMethod'> {
  authMethod: 'firebase'
}
export type Session = LegacySession | GoogleSession | FirebaseSession
export type ApiSession = Session & { token: string; householdId: string; expiresAt: string }
export type SessionInfo = Session & { householdId: string }
// 履歴には発行時の本人だけを保存し、現在の所属/失効世代へ依存させない。
export type PaymentActor = LegacySession | { person: Person | null; authMethod: 'google' | 'firebase'; userId: string }
