import 'server-only'
import { assertHouseholdContext, type HouseholdContext } from '../../cloudflare/worker/src/households'
import { requireAuth, type SessionInfo } from './webauthn/session'

export { assertHouseholdContext }
export type { HouseholdContext }

export async function requireHouseholdContext(): Promise<Readonly<SessionInfo>> {
  const session = await requireAuth()
  assertHouseholdContext(session)
  return Object.freeze({ ...session })
}
