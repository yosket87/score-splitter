import { z } from 'zod'
import { entryInputBaseSchema } from './entry'

export const expenseSchema = entryInputBaseSchema.extend({
  is_carryover: z.boolean().optional().default(false),
})

// 入力時は正の値、保存時に負の値に変換
export type ExpenseInput = z.infer<typeof expenseSchema>
