import { describe, it, expect } from 'vitest'
import { incomeSchema } from '@/lib/validations/income'

describe('incomeSchema', () => {
  const validData = {
    month: '202601',
    label: 'テスト収入',
    amount: 100000,
    person: 'husband' as const,
  }

  it('有効なデータを受け入れる', () => {
    const result = incomeSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validData)
    }
  })

  it('妻のデータも受け入れる', () => {
    const result = incomeSchema.safeParse({ ...validData, person: 'wife' })
    expect(result.success).toBe(true)
  })

  describe('月形式のバリデーション', () => {
    it.each(['202600', '202613', '000099'])('月の範囲外（%s）でエラー', (month) => {
      const result = incomeSchema.safeParse({ ...validData, month })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('月形式が不正です')
      }
    })

    it.each(Array.from({ length: 12 }, (_, index) => `2026${String(index + 1).padStart(2, '0')}`))(
      '有効な月（%s）を受け入れる',
      (month) => {
        expect(incomeSchema.safeParse({ ...validData, month }).success).toBe(true)
      }
    )

    it('不正な形式（桁数不足）でエラー', () => {
      const result = incomeSchema.safeParse({ ...validData, month: '20261' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('月形式が不正です')
      }
    })

    it('不正な形式（桁数超過）でエラー', () => {
      const result = incomeSchema.safeParse({
        ...validData,
        month: '2026010',
      })
      expect(result.success).toBe(false)
    })

    it('不正な形式（ハイフン付き）でエラー', () => {
      const result = incomeSchema.safeParse({
        ...validData,
        month: '2026-01',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('項目名のバリデーション', () => {
    it('空文字でエラー', () => {
      const result = incomeSchema.safeParse({ ...validData, label: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('項目名を入力してください')
      }
    })

    it('256文字以上でエラー', () => {
      const result = incomeSchema.safeParse({
        ...validData,
        label: 'あ'.repeat(256),
      })
      expect(result.success).toBe(false)
    })

    it('255文字は受け入れる', () => {
      const result = incomeSchema.safeParse({
        ...validData,
        label: 'あ'.repeat(255),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('金額のバリデーション', () => {
    it('0でエラー', () => {
      const result = incomeSchema.safeParse({ ...validData, amount: 0 })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          '金額は正の整数を入力してください'
        )
      }
    })

    it('負の値でエラー', () => {
      const result = incomeSchema.safeParse({ ...validData, amount: -100 })
      expect(result.success).toBe(false)
    })

    it('小数でエラー', () => {
      const result = incomeSchema.safeParse({ ...validData, amount: 100.5 })
      expect(result.success).toBe(false)
    })

    it('1は受け入れる', () => {
      const result = incomeSchema.safeParse({ ...validData, amount: 1 })
      expect(result.success).toBe(true)
    })
  })

  describe('担当者のバリデーション', () => {
    it('不正な値でエラー', () => {
      const result = incomeSchema.safeParse({ ...validData, person: 'invalid' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('担当者を選択してください')
      }
    })

    it('空文字でエラー', () => {
      const result = incomeSchema.safeParse({ ...validData, person: '' })
      expect(result.success).toBe(false)
    })
  })
})
