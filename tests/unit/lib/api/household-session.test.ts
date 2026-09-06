import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCookies } from '../../../mocks/next'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/sessions', () => ({ getSession: vi.fn() }))
import { getSession } from '@/lib/api/sessions'
import { householdSessionToken } from '@/lib/api/household-session'
const session = { token: 'a'.repeat(64), householdId: 'A', person: null, authMethod: 'password' as const, expiresAt: '2099-01-01' }
beforeEach(() => { vi.clearAllMocks(); mockCookies.get.mockReturnValue({ value: session.token }); vi.mocked(getSession).mockResolvedValue(session) })
describe('モックHTTPへ渡すsession token', () => {
  it('同じ世帯のDB sessionに対応するcookieを返す', async () => { expect(await householdSessionToken({ householdId: 'A' })).toBe(session.token) })
  it('cookieに一致するsessionが別世帯なら拒否', async () => { await expect(householdSessionToken({ householdId: 'B' })).rejects.toMatchObject({ status: 401 }) })
  it('cookieなしならDBへ問い合わせず拒否', async () => { mockCookies.get.mockReturnValue(undefined); await expect(householdSessionToken({ householdId: 'A' })).rejects.toMatchObject({ status: 401 }); expect(getSession).not.toHaveBeenCalled() })
  it('期限切れ・無効sessionを拒否', async () => { vi.mocked(getSession).mockResolvedValue(null); await expect(householdSessionToken({ householdId: 'A' })).rejects.toMatchObject({ status: 401 }) })
})
