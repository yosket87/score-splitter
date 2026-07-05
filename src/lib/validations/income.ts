import { z } from 'zod'
import { entryInputBaseSchema } from './entry'

export const incomeSchema = entryInputBaseSchema

export type IncomeInput = z.infer<typeof incomeSchema>
