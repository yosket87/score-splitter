import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  listPasskeys,
  verifyRegistration,
  deletePasskey,
} from '@/app/actions/passkeys'
import { PasskeyLoginButton } from '@/features/passkey/components/passkey-login-button'
import { RegisterPasskeyForm } from '@/features/passkey/components/register-passkey-form'
import { toast } from 'sonner'
import { PasskeySettings } from '@/features/passkey'

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

vi.mock('@/app/actions/passkeys', () => ({
  deletePasskey: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  listPasskeys: vi.fn(),
  verifyAuthentication: vi.fn(),
  verifyRegistration: vi.fn(),
}))

describe('passkey settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('パスキーログインの予期しない例外詳細を画面に表示しない', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(generateAuthenticationOptions).mockResolvedValueOnce({
      success: true,
      data: { challenge: 'authentication-challenge' },
    })
    vi.mocked(startAuthentication).mockRejectedValueOnce(
      Object.assign(new Error('credential secret'), { name: 'SecurityError' })
    )

    render(<PasskeyLoginButton />)

    await user.click(screen.getByRole('button', { name: 'パスキーでログイン' }))

    expect(
      await screen.findByText(
        'パスキー認証中にエラーが発生しました。時間をおいて再度お試しください。'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/credential secret/)).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('パスキー登録の予期しない例外詳細を画面に表示しない', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(generateRegistrationOptions).mockResolvedValueOnce({
      success: true,
      data: {
        challenge: 'registration-challenge',
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        rp: { id: 'localhost', name: 'ヤマワケ' },
        user: { id: 'user-id', name: 'husband', displayName: '夫' },
      },
    })
    vi.mocked(startRegistration).mockRejectedValueOnce(
      Object.assign(new Error('attestation secret'), { name: 'SecurityError' })
    )

    render(<RegisterPasskeyForm onRegistered={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'パスキーを登録' }))

    expect(
      await screen.findByText(
        'パスキーの登録中にエラーが発生しました。時間をおいて再度お試しください。'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/attestation secret/)).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('デバイス名の入力例を日本語で表示する', () => {
    render(<RegisterPasskeyForm onRegistered={vi.fn()} />)

    expect(screen.getByLabelText('デバイス名（任意）')).toHaveAttribute(
      'placeholder',
      '例：自分のスマートフォン'
    )
    expect(screen.queryByPlaceholderText('例: iPhone, 1Password')).not.toBeInTheDocument()
  })

  it('パスキー登録の担当者選択は夫を青、妻をローズで表示する', async () => {
    const user = userEvent.setup()
    render(<RegisterPasskeyForm onRegistered={vi.fn()} />)

    const husband = screen.getByRole('radio', { name: '夫' })
    const wife = screen.getByRole('radio', { name: '妻' })

    expect(husband).toHaveClass('bg-husband-light', 'text-husband', 'border-husband')
    expect(wife).not.toHaveClass('bg-wife-light')

    await user.click(wife)

    expect(wife).toHaveClass('bg-wife-light', 'text-wife', 'border-wife')
    expect(wife).not.toHaveClass('bg-accent', 'text-accent-foreground')
    expect(husband).toHaveTextContent('夫')
    expect(wife).toHaveTextContent('妻')
  })

  it('妻を選んだパスキー登録は妻として登録オプションを取得する', async () => {
    const user = userEvent.setup()
    vi.mocked(generateRegistrationOptions).mockResolvedValueOnce({
      success: false,
      error: '登録オプションの取得に失敗しました',
    })
    render(<RegisterPasskeyForm onRegistered={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: '妻' }))
    await user.click(screen.getByRole('button', { name: 'パスキーを登録' }))

    await waitFor(() => {
      expect(generateRegistrationOptions).toHaveBeenCalledWith('wife')
    })
  })

  it('パスキー一覧取得失敗時は空状態ではなくエラー状態を表示する', async () => {
    vi.mocked(listPasskeys).mockResolvedValueOnce({
      success: false,
      error: 'network detail',
    })

    render(<PasskeySettings householdId="A" />)

    await waitFor(() => {
      expect(screen.getByText('パスキー一覧の取得に失敗しました')).toBeInTheDocument()
    })
    expect(screen.queryByText('パスキーが登録されていません')).not.toBeInTheDocument()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const keyInfo = (name: string) => ({ id: name, deviceName: name, person: 'husband' as const, createdAt: '2026-09-01T00:00:00Z' })

it('同月と無関係な設定の世帯切替で一覧と入力を破棄し遅い一覧を無視する', async () => {
  vi.clearAllMocks()
  const response = deferred<Awaited<ReturnType<typeof listPasskeys>>>()
  vi.mocked(listPasskeys).mockReturnValueOnce(response.promise).mockResolvedValue({ success: true, data: [keyInfo('Bデバイス')] })
  const view = render(<PasskeySettings householdId="A" />)
  await userEvent.type(screen.getByLabelText('デバイス名（任意）'), 'Aの入力')
  view.rerender(<PasskeySettings householdId="B" />)
  expect(await screen.findByText('Bデバイス')).toBeInTheDocument()
  expect(screen.getByLabelText('デバイス名（任意）')).toHaveValue('')
  await act(async () => response.resolve({ success: true, data: [keyInfo('Aデバイス')] }))
  expect(screen.queryByText('Aデバイス')).not.toBeInTheDocument()
  expect(screen.getByText('Bデバイス')).toBeInTheDocument()
})

it('世帯切替後に返った登録optionsから認証器を起動しない', async () => {
  vi.clearAllMocks()
  const response = deferred<Awaited<ReturnType<typeof generateRegistrationOptions>>>()
  vi.mocked(listPasskeys).mockResolvedValue({ success: true, data: [] })
  vi.mocked(generateRegistrationOptions).mockReturnValue(response.promise)
  const view = render(<PasskeySettings householdId="A" />)
  await userEvent.click(screen.getByRole('button', { name: 'パスキーを登録' }))
  view.rerender(<PasskeySettings householdId="B" />)
  await act(async () => response.resolve({ success: true, data: { challenge: 'A-options', pubKeyCredParams: [{ alg: -7, type: 'public-key' }], rp: { id: 'localhost', name: 'ヤマワケ' }, user: { id: 'A:user', name: 'husband', displayName: '夫' } } }))
  expect(startRegistration).not.toHaveBeenCalled()
  expect(verifyRegistration).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'パスキーを登録' })).toBeEnabled()
})

it('世帯切替後に返った登録検証結果から一覧を再取得しない', async () => {
  vi.clearAllMocks()
  const response = deferred<Awaited<ReturnType<typeof verifyRegistration>>>()
  vi.mocked(listPasskeys).mockResolvedValue({ success: true, data: [] })
  vi.mocked(generateRegistrationOptions).mockResolvedValue({ success: true, data: { challenge: 'A-options', pubKeyCredParams: [{ alg: -7, type: 'public-key' }], rp: { id: 'localhost', name: 'ヤマワケ' }, user: { id: 'A:user', name: 'husband', displayName: '夫' } } })
  vi.mocked(startRegistration).mockResolvedValue({ id: 'credential' } as never)
  vi.mocked(verifyRegistration).mockReturnValue(response.promise)
  const view = render(<PasskeySettings householdId="A" />)
  await userEvent.click(screen.getByRole('button', { name: 'パスキーを登録' }))
  await waitFor(() => expect(verifyRegistration).toHaveBeenCalledOnce())
  view.rerender(<PasskeySettings householdId="B" />)
  const calls = vi.mocked(listPasskeys).mock.calls.length
  await act(async () => response.resolve({ success: true }))
  expect(listPasskeys).toHaveBeenCalledTimes(calls)
})

it('Aの削除失敗をBの画面へ通知しない', async () => {
  vi.clearAllMocks()
  const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => '')
  const response = deferred<Awaited<ReturnType<typeof deletePasskey>>>()
  vi.mocked(listPasskeys).mockResolvedValue({ success: true, data: [keyInfo('Aデバイス')] })
  vi.mocked(deletePasskey).mockReturnValue(response.promise)
  const view = render(<PasskeySettings householdId="A" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Aデバイスを削除' }))
  await userEvent.click(screen.getByRole('button', { name: '削除する' }))
  vi.mocked(listPasskeys).mockResolvedValue({ success: true, data: [] })
  view.rerender(<PasskeySettings householdId="B" />)
  await act(async () => response.resolve({ success: false, error: 'Aの削除エラー' }))
  expect(errorToast).not.toHaveBeenCalled()
  errorToast.mockRestore()
})
