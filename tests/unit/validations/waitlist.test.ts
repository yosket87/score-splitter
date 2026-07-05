import { describe, expect, it } from 'vitest'
import { waitlistFormSchema } from '@/lib/validations/waitlist'

describe('waitlistFormSchema', () => {
  it('有効な入力を受け付ける', () => {
    const result = waitlistFormSchema.safeParse({
      email: 'couple@example.com',
      priceIntent: 'paid_ok',
      simulatorUsed: true,
    })
    expect(result.success).toBe(true)
  })

  it('不正なメールアドレスを拒否する', () => {
    const result = waitlistFormSchema.safeParse({
      email: 'not-an-email',
      priceIntent: 'free_only',
      simulatorUsed: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('メールアドレスの形式が正しくありません')
    }
  })

  it('不正な価格意向を拒否する', () => {
    const result = waitlistFormSchema.safeParse({
      email: 'couple@example.com',
      priceIntent: 'maybe',
      simulatorUsed: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('料金の希望を選択してください')
    }
  })
})
