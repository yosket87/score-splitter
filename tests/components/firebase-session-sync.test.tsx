import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FirebaseSessionSync } from '@/features/firebase-auth/firebase-session-sync'

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(), signOut: vi.fn(), refresh: vi.fn(), listener: vi.fn(),
  pathname: '/2026', user: { getIdToken: vi.fn() },
}))
vi.mock('next/navigation', () => { const router = { refresh: mocks.refresh }; return { usePathname: () => mocks.pathname, useRouter: () => router } })
vi.mock('@/lib/auth/firebase-client', () => ({ getFirebaseAuth: () => ({ currentUser: mocks.user }) }))
vi.mock('firebase/auth', () => ({ onIdTokenChanged: (_auth: unknown, callback: (user: typeof mocks.user | null) => void) => { mocks.listener.mockImplementation(callback); return vi.fn() }, signOut: mocks.signOut }))
vi.mock('@/app/actions/firebase-auth', () => ({ exchangeFirebaseSession: mocks.exchange }))
const config = { projectId: 'test', apiKey: 'public', authDomain: 'test.firebaseapp.com', googleEnabled: true, appleEnabled: false }

describe('Firebaseセッション同期の実SDK分岐', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.pathname = '/2026'; vi.useFakeTimers(); mocks.user.getIdToken.mockResolvedValue('token'); mocks.signOut.mockResolvedValue(undefined) })
  afterEach(() => { vi.useRealTimers() })
  it('一時失敗ではSDK状態を維持し、1分後にセッション交換を再試行する', async () => {
    mocks.exchange.mockResolvedValueOnce({ ok: false, reason: 'retry' }).mockResolvedValue({ ok: true })
    render(<FirebaseSessionSync config={config} />)
    await act(async () => { mocks.listener(mocks.user) })
    expect(mocks.signOut).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.exchange).toHaveBeenCalledTimes(2)
  })
  it('確定した認証拒否の場合だけSDKをログアウトする', async () => {
    mocks.exchange.mockResolvedValue({ ok: false, reason: 'reauthenticate' })
    render(<FirebaseSessionSync config={config} />)
    await act(async () => { mocks.listener(mocks.user) })
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.exchange).toHaveBeenCalledTimes(1)
  })
  it('画面遷移時は成功済みの同じtokenを再交換せず、新tokenは交換する', async () => {
    mocks.exchange.mockResolvedValue({ ok: true })
    const { rerender } = render(<FirebaseSessionSync config={config} />)
    await act(async () => { mocks.listener(mocks.user) })
    mocks.pathname = '/2026/09'
    rerender(<FirebaseSessionSync config={config} />)
    await act(async () => { mocks.listener(mocks.user) })
    expect(mocks.exchange).toHaveBeenCalledTimes(1)
    mocks.user.getIdToken.mockResolvedValue('new-token')
    await act(async () => { mocks.listener(mocks.user) })
    expect(mocks.exchange).toHaveBeenCalledTimes(2)
  })
  it('ログアウト通知の後は同じtokenでも再交換する', async () => {
    mocks.exchange.mockResolvedValue({ ok: true })
    render(<FirebaseSessionSync config={config} />)
    await act(async () => { mocks.listener(mocks.user) })
    await act(async () => { mocks.listener(null) })
    await act(async () => { mocks.listener(mocks.user) })
    expect(mocks.exchange).toHaveBeenCalledTimes(2)
  })
  it('アンマウント後は予約した再試行を行わない', async () => {
    mocks.exchange.mockResolvedValue({ ok: false, reason: 'retry' })
    const { unmount } = render(<FirebaseSessionSync config={config} />)
    await act(async () => { mocks.listener(mocks.user) })
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.exchange).toHaveBeenCalledTimes(1)
  })
  it('通信例外でもSDK状態を維持して再試行する', async () => {
    mocks.exchange.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ ok: true })
    render(<FirebaseSessionSync config={config} />)
    await act(async () => { mocks.listener(mocks.user) })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.exchange).toHaveBeenCalledTimes(2)
  })
})
