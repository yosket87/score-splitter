import { describe, expect, it } from 'vitest'
import { canExchangeFirebaseSession } from '@/lib/auth/firebase-session-policy'

const identity = { projectId: 'yamawake-dev', uid: 'uid-1', provider: 'google.com' as const,
  email: 'person@example.com', authTime: 1000, issuedAt: 1200, expiresAt: 4600 }
const account = { projectId: 'yamawake-dev', uid: 'uid-1' }

describe('Firebaseセッション交換の本人確認', () => {
  it('初回は5分以内の本人認証だけ受理する', () => {
    expect(canExchangeFirebaseSession(identity, null, 'login', 1300)).toBe(true)
    expect(canExchangeFirebaseSession(identity, null, 'login', 1301)).toBe(false)
  })
  it('現在の有効セッションと同じproject/UIDのみ継続更新できる', () => {
    expect(canExchangeFirebaseSession(identity, account, 'refresh', 2000)).toBe(true)
    expect(canExchangeFirebaseSession(identity, null, 'refresh', 1200)).toBe(false)
    expect(canExchangeFirebaseSession(identity, { ...account, uid: 'uid-2' }, 'refresh', 1200)).toBe(false)
    expect(canExchangeFirebaseSession(identity, { ...account, projectId: 'other' }, 'refresh', 1200)).toBe(false)
  })
  it('別本人へのログイン切替は既存セッションを持ったまま行えない', () => {
    expect(canExchangeFirebaseSession(identity, { ...account, uid: 'uid-2' }, 'login', 1200)).toBe(false)
  })
  it('期限切れ・未来auth_time・不正modeは拒否する', () => {
    expect(canExchangeFirebaseSession(identity, account, 'refresh', 4600)).toBe(false)
    expect(canExchangeFirebaseSession(identity, null, 'login', 999)).toBe(false)
    expect(canExchangeFirebaseSession(identity, account, 'other', 1200)).toBe(false)
  })
})
