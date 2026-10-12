import { z } from 'zod'

// D1のparseMonthと同じYYYYMM契約。項目入力とは独立したコピー境界。
const copyMonthSchema = z.string().regex(/^\d{4}(0[1-9]|1[0-2])$/, '月形式が不正です')
const nonBlankString = z.string().refine(value => value.trim() !== '', '項目情報が不正です')

const selectedCopyItemSchema = z.object({
  // 既存IDはUUID以外も受け付け、保存済み項目との照合はD1側で行う。
  id: nonBlankString,
  label: nonBlankString,
  amount: z.number().refine(Number.isInteger, '金額は整数を指定してください'),
  person: z.enum(['husband', 'wife']),
  type: z.enum(['income', 'expense']),
  itemCopyMode: z.enum(['withAmount', 'labelOnly']),
}).refine(item => item.itemCopyMode === 'labelOnly' || (
  item.type === 'income' ? item.amount > 0 : item.amount < 0
), { message: '金額の符号が不正です', path: ['amount'] })

export const copyMonthPreviewInputSchema = z.object({
  sourceMonth: copyMonthSchema,
  targetMonth: copyMonthSchema,
})

export const copyMonthOptionsSchema = copyMonthPreviewInputSchema.extend({
  mode: z.enum(['add', 'skip', 'replace']),
  includeCarryover: z.boolean(),
  selectedItems: z.array(selectedCopyItemSchema),
  carryoverFingerprint: z.string().optional(),
}).refine(input => input.sourceMonth !== input.targetMonth, {
  message: '同じ月にはコピーできません', path: ['targetMonth'],
})
