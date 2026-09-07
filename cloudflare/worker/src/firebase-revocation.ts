import type { D1DatabaseLike, Runtime } from './d1'
import { FirebaseAuthError, firebaseOperation, firebaseSecret } from './firebase-shared'
import { firebaseSessionJoin, firebaseSessionWhere } from './firebase-session'
export function revokeFirebaseSessions(db:D1DatabaseLike,runtime:Runtime,token:string) {
 return firebaseOperation(async()=> {
  firebaseSecret.parse(token)
  const now=runtime.now()
  const row=await db.prepare(`UPDATE users SET session_epoch=session_epoch+1,
   firebase_auth_time_floor=MAX(firebase_auth_time_floor,?),
   oauth_attempt_floor=MAX(oauth_attempt_floor,COALESCE((SELECT MAX(sequence) FROM oauth_login_attempts),0)),updated_at=?
   WHERE id=(SELECT s.user_id ${firebaseSessionJoin} WHERE s.token=? AND ${firebaseSessionWhere})
   AND session_epoch<9007199254740991 RETURNING id AS userId,session_epoch AS sessionEpoch`)
   .bind(Math.floor(now.getTime()/1000),now.toISOString(),token,now.toISOString()).first<{userId:string;sessionEpoch:number}>()
  if(!row)throw new FirebaseAuthError()
  return row
 })
}
