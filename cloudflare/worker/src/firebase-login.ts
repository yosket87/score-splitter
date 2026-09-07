import { z } from 'zod'
import type { D1DatabaseLike, Runtime } from './d1'
import type { VerifiedFirebaseIdentity } from '../../../src/lib/auth/firebase-token'
import { FirebaseAuthError, firebaseAtomic, firebaseIdentitySchema, firebaseOperation, firebaseSecret } from './firebase-shared'
import { getFirebaseAccount } from './firebase-account'
import { insertFirebaseSession, newFirebaseSession } from './firebase-session-sql'
import { createFirebaseMigrationRequest } from './firebase-migrations'
import { consumeFirebaseApproval, type FirebaseApprovalRow } from './firebase-consume'
const optionsSchema=z.object({mode:z.enum(['login','refresh']),currentToken:firebaseSecret.optional()})
// identityは署名・project・provider・Firebase accountまで検証済みの呼出し専用。
export function completeFirebaseLogin(db:D1DatabaseLike,runtime:Runtime,value:VerifiedFirebaseIdentity,optionsValue:{mode:'login'|'refresh';currentToken?:string}) {
 return firebaseOperation(async()=>{
  const identity=firebaseIdentitySchema.parse(value),options=optionsSchema.parse(optionsValue),now=runtime.now(),seconds=Math.floor(now.getTime()/1000)
  const current=options.currentToken?await getFirebaseAccount(db,options.currentToken,now):null
  const same=current?.projectId===identity.projectId&&current.uid===identity.uid
  if(identity.expiresAt<=seconds||identity.issuedAt>seconds||identity.authTime>identity.issuedAt||identity.authTime>seconds||
   (options.mode==='refresh'&&!same)||(options.mode==='login'&&(seconds-identity.authTime>300||(current&&!same))))throw new FirebaseAuthError()
  const existing=await db.prepare(`SELECT i.user_id,i.revoked_at,u.active,u.session_epoch FROM firebase_identities i JOIN users u ON u.id=i.user_id WHERE i.project_id=? AND i.uid=?`)
   .bind(identity.projectId,identity.uid).first<{user_id:string;revoked_at:string|null;active:number;session_epoch:number}>()
  if(existing) {
   if(existing.revoked_at!==null||existing.active!==1)throw new FirebaseAuthError()
   const {results:memberships}=await db.prepare('SELECT id,household_id,default_person FROM household_memberships WHERE user_id=? AND revoked_at IS NULL')
    .bind(existing.user_id).all<{id:string;household_id:string;default_person:'husband'|'wife'}>()
   if(memberships.length!==1)throw new FirebaseAuthError()
   const membership=memberships[0],session=newFirebaseSession(now.toISOString(),existing.user_id,membership.id,membership.household_id,membership.default_person,existing.session_epoch,identity.expiresAt)
   await firebaseAtomic(db,[insertFirebaseSession(db,now.toISOString(),identity,session,false,options.mode==='refresh'?options.currentToken!:null)])
   return {kind:'authenticated' as const,session}
  }
  const approved=await db.prepare(`SELECT * FROM firebase_migration_requests WHERE project_id=? AND uid=? AND status='approved'
   AND julianday(expires_at)>julianday(?) AND julianday(approval_expires_at)>julianday(?)`)
   .bind(identity.projectId,identity.uid,now.toISOString(),now.toISOString()).first<FirebaseApprovalRow>()
  return approved?consumeFirebaseApproval(db,runtime,identity,approved):createFirebaseMigrationRequest(db,runtime,identity)
 })
}
