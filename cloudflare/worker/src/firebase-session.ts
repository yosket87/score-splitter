import type { ApiSession } from '../../../src/types/auth'
import type { D1DatabaseLike } from './d1'
import { firebaseOperation } from './firebase-shared'
export const firebaseSessionWhere = `s.auth_method='firebase' AND u.active=1 AND u.session_epoch=s.session_epoch
 AND i.revoked_at IS NULL AND m.revoked_at IS NULL AND s.firebase_auth_time>u.firebase_auth_time_floor
 AND julianday(s.expires_at)>julianday(?)
 AND (SELECT COUNT(*) FROM household_memberships WHERE user_id=u.id AND revoked_at IS NULL)=1`
export const firebaseSessionJoin = `FROM sessions s JOIN users u ON u.id=s.user_id
 JOIN firebase_identities i ON i.id=s.firebase_identity_id AND i.user_id=s.user_id
 JOIN household_memberships m ON m.id=s.membership_id AND m.user_id=s.user_id AND m.household_id=s.household_id`
export function readFirebaseSession(db:D1DatabaseLike,token:string,now:Date):Promise<ApiSession|null> {
 return firebaseOperation(async()=> {
  if(!/^[a-f0-9]{64}$/.test(token)) return null
  return db.prepare(`SELECT s.token,s.household_id AS householdId,m.default_person AS person,s.auth_method AS authMethod,
   s.user_id AS userId,s.membership_id AS membershipId,s.session_epoch AS sessionEpoch,s.expires_at AS expiresAt
   ${firebaseSessionJoin} WHERE s.token=? AND ${firebaseSessionWhere}`).bind(token,now.toISOString()).first<ApiSession>()
 })
}
