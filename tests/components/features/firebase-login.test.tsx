import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ popup: vi.fn(), exchange: vi.fn(), replace: vi.fn(), refresh: vi.fn(), signOut: vi.fn() }))
vi.mock('firebase/auth', () => ({ signInWithPopup: mocks.popup, signOut: mocks.signOut }))
vi.mock('@/lib/auth/firebase-client', () => ({ getFirebaseAuth: () => ({}), createFirebaseProvider: (id: string) => id,
  firebaseErrorMessage: () => 'ログインをキャンセルしました。' }))
vi.mock('@/app/actions/firebase-auth', () => ({ exchangeFirebaseSession: mocks.exchange }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }))
import { FirebaseLogin } from '@/features/firebase-auth/firebase-login'

const config = { projectId: 'yamawake-dev', apiKey: 'key', authDomain: 'yamawake-dev.firebaseapp.com', googleEnabled: true, appleEnabled: false }
describe('Firebaseログイン', () => {
  beforeEach(() => vi.resetAllMocks())
  it('設定済みproviderだけ表示する', () => {
    render(<FirebaseLogin config={config} />)
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Appleでログイン' })).not.toBeInTheDocument()
  })
  it('セッション交換成功後にだけ家計へ移動する', async () => {
    mocks.popup.mockResolvedValue({ user: { getIdToken: async () => 'signed-token' } })
    mocks.exchange.mockResolvedValue({ ok: true, destination: '/' })
    render(<FirebaseLogin config={config} />)
    fireEvent.click(screen.getByRole('button', { name: 'Googleでログイン' }))
    await waitFor(() => expect(mocks.exchange).toHaveBeenCalledWith('signed-token', 'login'))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
  })
  it('キャンセルを表示してセッションを発行しない', async () => {
    mocks.popup.mockRejectedValue({ code: 'auth/popup-closed-by-user' })
    render(<FirebaseLogin config={config} />)
    fireEvent.click(screen.getByRole('button', { name: 'Googleでログイン' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('キャンセル')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
  it('未承認なら家計ではなく本人確認画面へ移動する', async () => {
    mocks.popup.mockResolvedValue({ user: { getIdToken: async () => 'signed-token' } })
    mocks.exchange.mockResolvedValue({ ok: true, destination: '/auth/migration' })
    render(<FirebaseLogin config={{ ...config, appleEnabled: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Appleでログイン' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/auth/migration'))
  })
})
