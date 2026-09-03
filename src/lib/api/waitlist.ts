import { getDatabase, getRuntime, isWorkerApiMockEnabled, runD1Operation } from './backend'
import { apiRequest } from './client'
import { registerWaitlistEntry } from '../../../cloudflare/worker/src/waitlist'
import type { WaitlistInput } from '@/lib/validations/waitlist'

export async function registerWaitlist(input: WaitlistInput): Promise<void> {
  if (!isWorkerApiMockEnabled()) {
    await runD1Operation(() => registerWaitlistEntry(getDatabase(), getRuntime(), input))
    return
  }

  await apiRequest('waitlist', { method: 'POST', body: input })
}
