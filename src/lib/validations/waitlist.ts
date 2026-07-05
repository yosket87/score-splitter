import { z } from 'zod'

export const waitlistFormSchema = z.object({
  email: z
    .email('メールアドレスの形式が正しくありません')
    .max(255, 'メールアドレスが長すぎます'),
  priceIntent: z.enum(['free_only', 'paid_ok'], {
    message: '料金の希望を選択してください',
  }),
  simulatorUsed: z.boolean(),
})

export type WaitlistInput = z.infer<typeof waitlistFormSchema>
