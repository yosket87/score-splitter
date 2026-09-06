import 'server-only'
import { cookies } from 'next/headers'
import { assertHouseholdContext, type HouseholdContext } from '../../../cloudflare/worker/src/households'
import { ApiError } from './client'
import { getSession } from './sessions'

export async function householdSessionToken(context: HouseholdContext): Promise<string> {
  assertHouseholdContext(context)
  const token = (await cookies()).get('household_session')?.value
  const session = token ? await getSession(token) : null
  if (!token || !session || session.householdId !== context.householdId) throw new ApiError('認証が必要です',401)
  return token
}
