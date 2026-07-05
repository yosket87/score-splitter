import { apiRequest } from './client'
import type { WaitlistInput } from '@/lib/validations/waitlist'

export async function registerWaitlist(input: WaitlistInput): Promise<void> {
  await apiRequest('waitlist', { method: 'POST', body: input })
}
