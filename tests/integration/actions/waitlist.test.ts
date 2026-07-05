import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../../tests/mocks/next'
import { clearApiMocks, mockWaitlistApi } from '../../../tests/mocks/api'
import { joinWaitlist } from '@/app/actions/waitlist'

function createWaitlistFormData(
  overrides: Record<string, string> = {}
): FormData {
  const formData = new FormData()
  formData.set('email', 'couple@example.com')
  formData.set('priceIntent', 'paid_ok')
  formData.set('simulatorUsed', 'true')
  formData.set('website', '')
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value)
  }
  return formData
}

describe('joinWaitlist', () => {
  beforeEach(() => {
    clearApiMocks()
    vi.clearAllMocks()
  })

  it('有効な入力で登録しsuccessを返す', async () => {
    mockWaitlistApi.registerWaitlist.mockResolvedValueOnce(undefined)

    const result = await joinWaitlist(null, createWaitlistFormData())

    expect(mockWaitlistApi.registerWaitlist).toHaveBeenCalledWith({
      email: 'couple@example.com',
      priceIntent: 'paid_ok',
      simulatorUsed: true,
    })
    expect(result).toEqual({ success: true })
  })

  it('不正なメールアドレスはバリデーションエラーを返す', async () => {
    const result = await joinWaitlist(
      null,
      createWaitlistFormData({ email: 'not-an-email' })
    )

    expect(result).toEqual({
      success: false,
      error: 'メールアドレスの形式が正しくありません',
    })
    expect(mockWaitlistApi.registerWaitlist).not.toHaveBeenCalled()
  })

  it('honeypotに値があれば成功を装いAPIを呼ばない', async () => {
    const result = await joinWaitlist(
      null,
      createWaitlistFormData({ website: 'https://spam.example.com' })
    )

    expect(result).toEqual({ success: true })
    expect(mockWaitlistApi.registerWaitlist).not.toHaveBeenCalled()
  })

  it('API障害時はユーザー向けエラーを返す', async () => {
    mockWaitlistApi.registerWaitlist.mockRejectedValueOnce(new Error('API error'))

    const result = await joinWaitlist(null, createWaitlistFormData())

    expect(result).toEqual({
      success: false,
      error: '登録に失敗しました。時間をおいて再度お試しください',
    })
  })
})
