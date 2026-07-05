import { z } from 'zod'
import { entryInputBaseSchema } from './entry'

export const carryoverSchema = entryInputBaseSchema.extend({
  is_cleared: z.boolean().optional().default(false),
})

// 入力時は正の値、保存時に負の値に変換
export type CarryoverInput = z.infer<typeof carryoverSchema>
