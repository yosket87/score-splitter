import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { PasskeyList } from '@/features/passkey/components/passkey-list'
import { deletePasskey } from '@/app/actions/passkeys'
import type { PasskeyInfo } from '@/features/passkey/types'

vi.mock('@/app/actions/passkeys', () => ({
  deletePasskey: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('PasskeyList', () => {
  const passkeys: PasskeyInfo[] = [
    {
      id: 'credential-1',
      person: 'husband',
      deviceName: 'MacBook',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  it('削除ボタンは競合クラスなしで44px以上のタッチ領域を持つ', () => {
    render(<PasskeyList passkeys={passkeys} onDeleted={vi.fn()} />)

    const deleteButton = screen.getByRole('button', { name: 'MacBookを削除' })
    expect(deleteButton).toHaveClass('size-11')
    expect(deleteButton).not.toHaveClass('h-9', 'w-9')
  })

  it('削除前に確認し、失敗時はエラーtoastを表示する', async () => {
    const user = userEvent.setup()
    const onDeleted = vi.fn()
    vi.mocked(deletePasskey).mockResolvedValueOnce({
      success: false,
      error: 'パスキーの削除に失敗しました',
    })

    render(<PasskeyList passkeys={passkeys} onDeleted={onDeleted} />)

    await user.click(screen.getByRole('button', { name: 'MacBookを削除' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('「MacBook」を削除しますか？')).toBeInTheDocument()
    expect(deletePasskey).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '削除する' }))

    expect(deletePasskey).toHaveBeenCalledWith('credential-1')
    expect(toast.error).toHaveBeenCalledWith('パスキーの削除に失敗しました')
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
