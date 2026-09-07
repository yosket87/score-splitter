import type { D1DatabaseLike, Runtime } from './d1'
import type { VerifiedFirebaseIdentity } from '../../../src/lib/auth/firebase-token'
import { firebaseAtomic, FirebaseAuthError } from './firebase-shared'
import { insertFirebaseSession, newFirebaseSession } from './firebase-session-sql'
export interface FirebaseApprovalRow {
 id:string;purpose:'legacy_enrollment'|'identity_link'|'identity_recovery';approved_household_id:string;
 approved_default_person:'husband'|'wife';target_user_id:string;expected_session_epoch:number;expected_old_identity_id:string|null
}
export async function consumeFirebaseApproval(db:D1DatabaseLike,runtime:Runtime,identity:VerifiedFirebaseIdentity,approval:FirebaseApprovalRow) {
 const now=runtime.now().toISOString(),consumptionId=runtime.randomUUID()
 const isEnrollment=approval.purpose==='legacy_enrollment',isRecovery=approval.purpose==='identity_recovery'
 const userId=isEnrollment?runtime.randomUUID():approval.target_user_id
 const membership=isEnrollment?{id:runtime.randomUUID(),household_id:approval.approved_household_id,default_person:approval.approved_default_person}:
 await db.prepare('SELECT id,household_id,default_person FROM household_memberships WHERE user_id=? AND revoked_at IS NULL')
 .bind(userId).first<{id:string;household_id:string;default_person:'husband'|'wife'}>()
 if(!membership)throw new FirebaseAuthError()
 const session=newFirebaseSession(now,userId,membership.id,membership.household_id,membership.default_person,isEnrollment?0:approval.expected_session_epoch,identity.expiresAt)
 const claim=db.prepare(`UPDATE firebase_migration_requests SET status='consuming',consumption_id=?
 WHERE id=? AND project_id=? AND uid=? AND status='approved' AND julianday(expires_at)>julianday(?)
 AND julianday(approval_expires_at)>julianday(?) AND julianday(expires_at)>julianday('now') AND julianday(approval_expires_at)>julianday('now')
 AND ((purpose='legacy_enrollment' AND EXISTS(SELECT 1 FROM households WHERE id=approved_household_id AND legacy_auth_key='legacy' AND legacy_auth_disabled_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM household_memberships WHERE household_id=approved_household_id AND default_person=approved_default_person AND revoked_at IS NULL))
 OR (purpose IN ('identity_link','identity_recovery') AND EXISTS(SELECT 1 FROM users WHERE id=target_user_id AND active=1 AND session_epoch=expected_session_epoch AND (SELECT COUNT(*) FROM household_memberships WHERE user_id=target_user_id AND revoked_at IS NULL)=1)
 AND ((purpose='identity_link' AND NOT EXISTS(SELECT 1 FROM firebase_identities WHERE user_id=target_user_id))
 OR (purpose='identity_recovery' AND EXISTS(SELECT 1 FROM firebase_identities WHERE id=expected_old_identity_id AND user_id=target_user_id)
 AND NOT EXISTS(SELECT 1 FROM firebase_identities WHERE user_id=target_user_id AND revoked_at IS NULL AND id<>expected_old_identity_id)))))`)
 .bind(consumptionId,approval.id,identity.projectId,identity.uid,now,now)
 const proof=`SELECT 1 FROM firebase_migration_requests WHERE id=? AND status='consuming' AND consumption_id=?`
 const operations=[claim]
 if(isEnrollment) {
  operations.push(db.prepare(`INSERT INTO users(id,created_at,updated_at) VALUES((SELECT ? WHERE EXISTS(${proof})),?,?)`).bind(userId,approval.id,consumptionId,now,now))
  operations.push(db.prepare('INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES(?,?,?,?,?)').bind(membership.id,userId,membership.household_id,membership.default_person,now))
 }
 if(isRecovery) {
  operations.push(db.prepare(`UPDATE firebase_identities SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND user_id=? AND EXISTS(${proof})`).bind(now,approval.expected_old_identity_id,userId,approval.id,consumptionId))
  operations.push(db.prepare(`UPDATE users SET session_epoch=session_epoch+1,firebase_auth_time_floor=MAX(firebase_auth_time_floor,?),
   oauth_attempt_floor=MAX(oauth_attempt_floor,COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts),0)),updated_at=?
   WHERE id=? AND session_epoch=? AND active=1 AND EXISTS(${proof})`).bind(Math.floor(runtime.now().getTime()/1000),now,userId,approval.expected_session_epoch,approval.id,consumptionId))
 }
 operations.push(db.prepare(`UPDATE firebase_migration_requests SET status='consumed',consumed_at=?,consumed_user_id=?
 WHERE id=? AND status='consuming' AND consumption_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND session_epoch=?)`)
 .bind(now,userId,approval.id,consumptionId,userId,isEnrollment?0:approval.expected_session_epoch+(isRecovery?1:0)))
 operations.push(db.prepare(`INSERT INTO firebase_identities(id,user_id,project_id,uid,email,created_at)
 VALUES((SELECT ? FROM firebase_migration_requests WHERE id=? AND status='consumed' AND consumption_id=? AND changes()=1),?,?,?,?,?)`)
 .bind(runtime.randomUUID(),approval.id,consumptionId,userId,identity.projectId,identity.uid,identity.email,now))
 if(!isRecovery) operations.push(insertFirebaseSession(db,now,identity,session,true))
 await firebaseAtomic(db,operations)
 return isRecovery?{kind:'recovered' as const,userId}:{kind:'authenticated' as const,session}
}
