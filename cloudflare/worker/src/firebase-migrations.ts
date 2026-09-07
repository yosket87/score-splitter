import { z } from 'zod'
import type { D1DatabaseLike, Runtime } from './d1'
import type { VerifiedFirebaseIdentity } from '../../../src/lib/auth/firebase-token'
import { firebaseOperation, FirebaseAuthError, firebaseSecret, hashSecret, opaque, randomSecret, expiresIn } from './firebase-shared'

export async function createFirebaseMigrationRequest(db:D1DatabaseLike,runtime:Runtime,identity:VerifiedFirebaseIdentity) {
 const now=runtime.now().toISOString(),requestId=runtime.randomUUID(),code=randomSecret(),browserSecret=randomSecret()
 const expiresAt=expiresIn(now,30*60_000)
 await db.prepare(`INSERT INTO firebase_migration_requests(id,purpose,project_id,uid,email,code_hash,browser_binding_hash,created_at,expires_at)
 VALUES(?,'legacy_enrollment',?,?,?,?,?,?,?)`)
 .bind(requestId,identity.projectId,identity.uid,identity.email,await hashSecret(code),await hashSecret(browserSecret),now,expiresAt).run()
 return {kind:'migration_pending' as const,requestId,code,browserSecret,expiresAt}
}
export function getFirebaseMigrationDisplay(db:D1DatabaseLike,runtime:Runtime,id:string,browserSecret:string,code:string) {
 return firebaseOperation(async()=>{
  opaque.parse(id);firebaseSecret.parse(browserSecret);firebaseSecret.parse(code)
  const now=runtime.now().toISOString()
  const row=await db.prepare(`SELECT email,status FROM firebase_migration_requests WHERE id=? AND browser_binding_hash=? AND code_hash=?
   AND status IN ('pending','approved','consumed') AND julianday(expires_at)>julianday(?)
   AND (status<>'approved' OR julianday(approval_expires_at)>julianday(?))`)
   .bind(id,await hashSecret(browserSecret),await hashSecret(code),now,now).first<{email:string|null;status:string}>()
  return row?{...row,code}:null
 })
}
const common={requestId:opaque,code:firebaseSecret,approvedBy:opaque,confirmationRef:opaque}
const epoch=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1)
const enrollment=z.object({...common,householdId:opaque,legacySlot:z.enum(['existing-member-1','existing-member-2']),defaultPerson:z.enum(['husband','wife'])})
const link=z.object({...common,targetUserId:opaque,expectedEpoch:epoch})
const recovery=link.extend({expectedOldIdentityId:opaque})
export type FirebaseMigrationApproval=z.infer<typeof enrollment>|z.infer<typeof link>
export type FirebaseRecoveryApproval=z.infer<typeof recovery>
export async function expireFirebaseRequests(db:D1DatabaseLike,now:string) {
 await db.prepare(`UPDATE firebase_migration_requests SET status='expired' WHERE status IN ('pending','approved')
 AND (julianday(expires_at)<=julianday(?) OR (status='approved' AND julianday(approval_expires_at)<=julianday(?)))`).bind(now,now).run()
}
export function approveFirebaseMigration(db:D1DatabaseLike,runtime:Runtime,value:FirebaseMigrationApproval) {
 return firebaseOperation(async()=>{
  if('targetUserId' in value) return approveExisting(db,runtime,link.parse(value),null)
  const input=enrollment.parse(value),now=runtime.now().toISOString(),expires=expiresIn(now,10*60_000)
  await expireFirebaseRequests(db,now)
  const row=await db.prepare(`UPDATE firebase_migration_requests SET status='approved',approved_at=?,
   approval_expires_at=MIN(expires_at,?),approved_by=?,confirmation_ref=?,approved_household_id=?,approved_default_person=?,legacy_slot=?
   WHERE id=? AND code_hash=? AND status='pending' AND julianday(expires_at)>julianday(?) AND julianday(expires_at)>julianday('now')
   AND NOT EXISTS(SELECT 1 FROM firebase_identities WHERE project_id=firebase_migration_requests.project_id AND uid=firebase_migration_requests.uid)
   AND EXISTS(SELECT 1 FROM households WHERE id=? AND legacy_auth_key='legacy' AND legacy_auth_disabled_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM household_memberships WHERE household_id=? AND default_person=? AND revoked_at IS NULL)
   RETURNING id AS requestId`)
   .bind(now,expires,input.approvedBy,input.confirmationRef,input.householdId,input.defaultPerson,input.legacySlot,
    input.requestId,await hashSecret(input.code),now,input.householdId,input.householdId,input.defaultPerson).first<{requestId:string}>()
  if(!row)throw new FirebaseAuthError()
  return row
 })
}
async function approveExisting(db:D1DatabaseLike,runtime:Runtime,input:z.infer<typeof link>,oldIdentity:string|null) {
 const now=runtime.now().toISOString(),expires=expiresIn(now,10*60_000)
 await expireFirebaseRequests(db,now)
 const row=await db.prepare(`UPDATE firebase_migration_requests SET status='approved',purpose=?,approved_at=?,approval_expires_at=MIN(expires_at,?),
 approved_by=?,confirmation_ref=?,target_user_id=?,expected_session_epoch=?,expected_old_identity_id=?
 WHERE id=? AND code_hash=? AND status='pending' AND julianday(expires_at)>julianday(?) AND julianday(expires_at)>julianday('now')
 AND NOT EXISTS(SELECT 1 FROM firebase_identities WHERE project_id=firebase_migration_requests.project_id AND uid=firebase_migration_requests.uid)
 AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.active=1 AND u.session_epoch=?
 AND (SELECT COUNT(*) FROM household_memberships WHERE user_id=u.id AND revoked_at IS NULL)=1
 AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM firebase_identities WHERE user_id=u.id))
 OR (? IS NOT NULL AND EXISTS(SELECT 1 FROM firebase_identities WHERE id=? AND user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM firebase_identities WHERE user_id=u.id AND revoked_at IS NULL AND id<>?))))
 RETURNING id AS requestId`)
 .bind(oldIdentity?'identity_recovery':'identity_link',now,expires,input.approvedBy,input.confirmationRef,input.targetUserId,input.expectedEpoch,oldIdentity,
 input.requestId,await hashSecret(input.code),now,input.targetUserId,input.expectedEpoch,oldIdentity,oldIdentity,oldIdentity,oldIdentity).first<{requestId:string}>()
 if(!row)throw new FirebaseAuthError()
 return row
}
export function approveFirebaseRecovery(db:D1DatabaseLike,runtime:Runtime,value:FirebaseRecoveryApproval) {
 return firebaseOperation(async()=>{const input=recovery.parse(value);return approveExisting(db,runtime,input,input.expectedOldIdentityId)})
}
