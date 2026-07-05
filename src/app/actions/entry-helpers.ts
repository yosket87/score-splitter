import { revalidateHouseholdData } from './revalidation'
import type { ActionResult } from '@/types'

interface ActionMessages {
  log: string
  error: string
}

export async function runEntryQuery<T>(
  messages: ActionMessages,
  fetcher: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await fetcher() }
  } catch (error) {
    console.error(messages.log, error)
    return { success: false, error: messages.error }
  }
}

export async function runEntryMutation<T>(
  messages: ActionMessages,
  month: string | undefined,
  mutate: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await mutate()
    revalidateHouseholdData(month)
    return { success: true, data }
  } catch (error) {
    console.error(messages.log, error)
    return { success: false, error: messages.error }
  }
}

export function readEntryFormData(formData: FormData) {
  return {
    month: formData.get('month') as string,
    label: formData.get('label') as string,
    amount: Number(formData.get('amount')),
    person: formData.get('person') as string,
  }
}
