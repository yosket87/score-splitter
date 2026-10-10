import { describe, it, expect } from 'vitest'
import { carryoverSchema } from '@/lib/validations/carryover'

describe('carryoverSchema', () => {
  // 入力時は正の値（保存時に負の値に変換される）
  const validData = {
    month: '202601',
    label: 'テスト繰越',
    amount: 10000,
    person: 'husband' as const,
  }

  it('有効なデータを受け入れる', () => {
    const result = carryoverSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ ...validData, is_cleared: false })
    }
  })

  it('妻のデータも受け入れる', () => {
    const result = carryoverSchema.safeParse({ ...validData, person: 'wife' })
    expect(result.success).toBe(true)
  })

  describe('月形式のバリデーション', () => {
    it.each(['202600', '202613', '000099'])('月の範囲外（%s）でエラー', (month) => {
      const result = carryoverSchema.safeParse({ ...validData, month })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('月形式が不正です')
      }
    })

    it.each(Array.from({ length: 12 }, (_, index) => `2026${String(index + 1).padStart(2, '0')}`))(
      '有効な月（%s）を受け入れる',
      (month) => {
        expect(carryoverSchema.safeParse({ ...validData, month }).success).toBe(true)
      }
    )

    it('不正な形式（桁数不足）でエラー', () => {
      const result = carryoverSchema.safeParse({
        ...validData,
        month: '20261',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('月形式が不正です')
      }
    })

    it('不正な形式（桁数超過）でエラー', () => {
      const result = carryoverSchema.safeParse({
        ...validData,
        month: '2026010',
      })
      expect(result.success).toBe(false)
    })

    it('不正な形式（ハイフン付き）でエラー', () => {
      const result = carryoverSchema.safeParse({
        ...validData,
        month: '2026-01',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('項目名のバリデーション', () => {
    it('空文字でエラー', () => {
      const result = carryoverSchema.safeParse({ ...validData, label: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('項目名を入力してください')
      }
    })

    it('256文字以上でエラー', () => {
      const result = carryoverSchema.safeParse({
        ...validData,
        label: 'あ'.repeat(256),
      })
      expect(result.success).toBe(false)
    })

    it('255文字は受け入れる', () => {
      const result = carryoverSchema.safeParse({
        ...validData,
        label: 'あ'.repeat(255),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('金額のバリデーション', () => {
    it('0でエラー', () => {
      const result = carryoverSchema.safeParse({ ...validData, amount: 0 })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          '金額は正の整数を入力してください'
        )
      }
    })

    it('負の値でエラー（入力時は正の値を期待）', () => {
      const result = carryoverSchema.safeParse({ ...validData, amount: -100 })
      expect(result.success).toBe(false)
    })

    it('小数でエラー', () => {
      const result = carryoverSchema.safeParse({ ...validData, amount: 100.5 })
      expect(result.success).toBe(false)
    })

    it('1は受け入れる', () => {
      const result = carryoverSchema.safeParse({ ...validData, amount: 1 })
      expect(result.success).toBe(true)
    })
  })

  describe('担当者のバリデーション', () => {
    it('不正な値でエラー', () => {
      const result = carryoverSchema.safeParse({
        ...validData,
        person: 'invalid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('担当者を選択してください')
      }
    })

    it('空文字でエラー', () => {
      const result = carryoverSchema.safeParse({ ...validData, person: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('is_clearedのバリデーション', () => {
    it('trueを受け入れる', () => {
      const result = carryoverSchema.safeParse({ ...validData, is_cleared: true })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.is_cleared).toBe(true)
      }
    })

    it('falseを受け入れる', () => {
      const result = carryoverSchema.safeParse({ ...validData, is_cleared: false })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.is_cleared).toBe(false)
      }
    })

    it('省略時はfalseがデフォルト', () => {
      const result = carryoverSchema.safeParse(validData)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.is_cleared).toBe(false)
      }
    })
  })
})
