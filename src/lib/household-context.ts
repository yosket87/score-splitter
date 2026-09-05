import 'server-only'
import { assertHouseholdContext, type HouseholdContext } from '../../cloudflare/worker/src/households'
import { requireAuth } from './webauthn/session'

export { assertHouseholdContext }
export type { HouseholdContext }

export async function requireHouseholdContext(): Promise<HouseholdContext> {
  const session = await requireAuth()
  assertHouseholdContext(session)
  return Object.freeze({ householdId: session.householdId })
}
