import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderActions } from '@/components/layout/header-actions'
import { FirebaseClientProvider } from '@/features/firebase-auth/firebase-client-context'
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), logout: vi.fn(), getAuth: vi.fn(), error: vi.fn() }))
vi.mock('firebase/auth', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/auth/firebase-client', () => ({ getFirebaseAuth: mocks.getAuth }))
vi.mock('@/app/actions/auth', () => ({ logout: mocks.logout }))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('@/components/ui/theme-toggle', () => ({ ThemeToggle: () => null }))
const config = { projectId: 'test', apiKey: 'public', authDomain: 'test.firebaseapp.com', googleEnabled: true, appleEnabled: false }

describe('通常ログアウトの実SDK分岐', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.signOut.mockResolvedValue(undefined); mocks.logout.mockResolvedValue(undefined) })
  it('SDKログアウト完了後にCookie削除と遷移を行う既存Actionを呼ぶ', async () => {
    render(<FirebaseClientProvider config={config}><HeaderActions /></FirebaseClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1))
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.logout.mock.invocationCallOrder[0])
  })
  it('SDKログアウトの完了までサーバーのログアウトを待つ', async () => {
    let finish!: () => void
    mocks.signOut.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    render(<FirebaseClientProvider config={config}><HeaderActions /></FirebaseClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.logout).not.toHaveBeenCalled()
    await act(async () => { finish() })
    expect(mocks.logout).toHaveBeenCalledTimes(1)
  })
  it('SDKログアウトが失敗したらエラーを示し、既存ActionによるCookie削除は実行する', async () => {
    mocks.signOut.mockRejectedValue(new Error('storage'))
    render(<FirebaseClientProvider config={config}><HeaderActions /></FirebaseClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1))
    expect(mocks.error).toHaveBeenCalled()
  })
  it.each([null, { ...config, mock: true }])('従来認証とモックはSDKを初期化せず既存Actionを呼ぶ (%s)', async value => {
    render(<FirebaseClientProvider config={value}><HeaderActions /></FirebaseClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1))
    expect(mocks.getAuth).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
