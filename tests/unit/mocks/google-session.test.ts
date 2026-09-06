import { beforeEach, expect, it } from 'vitest'
import { initStore, insertRows, updateRows } from '@/mocks/db'
import { apiSession, validSession, MOCK_LEGACY_HOUSEHOLD_ID } from '@/mocks/auth-handlers'
const token = 'c'.repeat(64)
beforeEach(() => {
  initStore()
  insertRows('users', [{ id: 'user', active: 1, session_epoch: 2 }])
  insertRows('household_memberships', [{ id: 'member', user_id: 'user', household_id: MOCK_LEGACY_HOUSEHOLD_ID, default_person: 'wife', revoked_at: null }])
  insertRows('sessions', [{ token, user_id: 'user', membership_id: 'member', household_id: MOCK_LEGACY_HOUSEHOLD_ID,
    session_epoch: 2, person: 'husband', auth_method: 'google', expires_at: '2099-01-01T00:00:00Z' }])
})
it('UIモックでも現在の所属担当者と個人metadataを返す', () => {
  expect(apiSession(validSession(token)!)).toMatchObject({ userId: 'user', membershipId: 'member', sessionEpoch: 2, person: 'wife', authMethod: 'google' })
})
it.each([{ active: 0 }, { session_epoch: 3 }])('ユーザーの失効を反映する %j', override => {
  updateRows('users', { id: 'eq.user' }, override)
  expect(validSession(token)).toBeNull()
})
it('所属解除を反映する', () => {
  updateRows('household_memberships', { id: 'eq.member' }, { revoked_at: new Date().toISOString() })
  expect(validSession(token)).toBeNull()
})

it('旧ログイン停止後はUIモックでも新しいlegacy sessionを発行しない', async () => {
  const { setupServer } = await import('msw/node')
  const { createAuthHandlers } = await import('@/mocks/auth-handlers')
  const server = setupServer(...createAuthHandlers('http://auth-google-mock.local', 'internal'))
  server.listen({ onUnhandledRequest: 'error' })
  try {
    updateRows('households', { id: `eq.${MOCK_LEGACY_HOUSEHOLD_ID}` }, { legacy_auth_disabled_at: new Date().toISOString() })
    const response = await fetch('http://auth-google-mock.local/internal/auth/sessions', {
      method: 'POST', headers: { authorization: 'Bearer internal', 'content-type': 'application/json' },
      body: JSON.stringify({ householdId: MOCK_LEGACY_HOUSEHOLD_ID, token: 'd'.repeat(64), authMethod: 'password', person: null, expiresAt: '2099-01-01T00:00:00Z' }),
    })
    expect(response.status).toBe(401)
  } finally { server.close() }
})
