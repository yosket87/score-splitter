import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn(), revoke: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => fixture }))
vi.mock('@/lib/api/google-auth', () => ({ revokeGoogleSessions: fixture.revoke }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
import { logoutAllGoogleSessions } from '@/app/actions/google-auth'
beforeEach(() => { vi.clearAllMocks(); fixture.get.mockReturnValue({ value: 'a'.repeat(64) }); fixture.revoke.mockResolvedValue({ userId: 'user-a', sessionEpoch: 1 }) })
it('本人のCookieを認可してDB失効後だけCookieを消す', async () => {
  await expect(logoutAllGoogleSessions({})).rejects.toThrow('REDIRECT:/login')
  expect(fixture.revoke).toHaveBeenCalledWith('a'.repeat(64))
  expect(fixture.delete).toHaveBeenCalledWith('household_session')
  expect(fixture.revoke.mock.invocationCallOrder[0]).toBeLessThan(fixture.delete.mock.invocationCallOrder[0])
})
it('DB失効失敗は成功にせずCookieを保持し安全なメッセージを返す', async () => {
  fixture.revoke.mockRejectedValue(new Error('token=secret-fixture'))
  const result = await logoutAllGoogleSessions({})
  expect(result.error).toBe('ログアウトできませんでした。時間をおいてもう一度お試しください。')
  expect(fixture.delete).not.toHaveBeenCalled()
})
it('Cookieなしでは失効操作を呼ばない', async () => {
  fixture.get.mockReturnValue(undefined)
  expect(await logoutAllGoogleSessions({})).toEqual({ error: 'ログインし直してください。' })
  expect(fixture.revoke).not.toHaveBeenCalled()
})
