import type { D1DatabaseLike } from './d1'
import type { VerifiedFirebaseIdentity } from '../../../src/lib/auth/firebase-token'
import { randomSecret, expiresIn } from './firebase-shared'
export interface FirebaseSessionData {
 token:string; householdId:string; person:'husband'|'wife'; authMethod:'firebase'; userId:string; membershipId:string; sessionEpoch:number; expiresAt:string
}
export function newFirebaseSession(now:string,userId:string,membershipId:string,householdId:string,person:'husband'|'wife',sessionEpoch:number,tokenExpiresAt:number):FirebaseSessionData {
 return {token:randomSecret(),householdId,person,authMethod:'firebase',userId,membershipId,sessionEpoch,expiresAt:new Date(Math.min(Date.parse(expiresIn(now,60*60_000)),tokenExpiresAt*1000)).toISOString()}
}
export function insertFirebaseSession(db:D1DatabaseLike,now:string,identity:VerifiedFirebaseIdentity,session:FirebaseSessionData,requirePreviousChange=false,currentToken:string|null=null) {
 // 条件不成立を必須列のNULLへ変換し、先行の承認・identity登録もbatch全体で戻す。
 return db.prepare(`INSERT INTO sessions(token,household_id,person,auth_method,expires_at,created_at,user_id,membership_id,session_epoch,firebase_identity_id,firebase_auth_time)
 VALUES(?,?,?,'firebase',?,?,(SELECT u.id FROM users u JOIN firebase_identities i ON i.user_id=u.id
 WHERE u.id=? AND u.active=1 AND u.session_epoch=? AND i.project_id=? AND i.uid=? AND i.revoked_at IS NULL
 AND ?>u.firebase_auth_time_floor AND (?=0 OR changes()=1)
 AND (? IS NULL OR EXISTS(SELECT 1 FROM sessions current WHERE current.token=? AND current.user_id=u.id
 AND current.firebase_identity_id=i.id AND current.auth_method='firebase' AND current.session_epoch=u.session_epoch
 AND current.firebase_auth_time>u.firebase_auth_time_floor AND julianday(current.expires_at)>julianday(?)
 AND julianday(current.expires_at)>julianday('now')))),?,?,
 (SELECT id FROM firebase_identities WHERE project_id=? AND uid=? AND revoked_at IS NULL),?)`)
 .bind(session.token,session.householdId,session.person,session.expiresAt,now,session.userId,session.sessionEpoch,
 identity.projectId,identity.uid,identity.authTime,requirePreviousChange?1:0,currentToken,currentToken,now,
 session.membershipId,session.sessionEpoch,identity.projectId,identity.uid,identity.authTime)
}
