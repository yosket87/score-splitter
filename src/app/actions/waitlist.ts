'use server'

import { registerWaitlist } from '@/lib/api/waitlist'
import { waitlistFormSchema } from '@/lib/validations/waitlist'
import type { ActionResult } from '@/types'

export async function joinWaitlist(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  // honeypot: botには成功を装って何もしない
  const website = formData.get('website')
  if (typeof website === 'string' && website.trim() !== '') {
    return { success: true }
  }

  const parsed = waitlistFormSchema.safeParse({
    email: formData.get('email'),
    priceIntent: formData.get('priceIntent'),
    simulatorUsed: formData.get('simulatorUsed') === 'true',
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    await registerWaitlist(parsed.data)
    return { success: true }
  } catch (error) {
    console.error('ウェイトリスト登録エラー:', error)
    return {
      success: false,
      error: '登録に失敗しました。時間をおいて再度お試しください',
    }
  }
}
