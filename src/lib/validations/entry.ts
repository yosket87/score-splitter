import { z } from 'zod'

export const entryInputBaseSchema = z.object({
  month: z.string().regex(/^\d{6}$/, '月形式が不正です'),
  label: z.string().min(1, '項目名を入力してください').max(255),
  amount: z.number().int().positive('金額は正の整数を入力してください'),
  person: z.enum(['husband', 'wife'], {
    message: '担当者を選択してください',
  }),
})
