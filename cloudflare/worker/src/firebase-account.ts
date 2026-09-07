import type { D1DatabaseLike } from './d1'
import { firebaseOperation } from './firebase-shared'
import { firebaseSessionJoin, firebaseSessionWhere } from './firebase-session'
export function getFirebaseAccount(db:D1DatabaseLike,token:string,now:Date=new Date()) {
 return firebaseOperation(async()=> {
  if(!/^[a-f0-9]{64}$/.test(token))return null
  return db.prepare(`SELECT i.project_id AS projectId,i.uid,i.email ${firebaseSessionJoin}
   WHERE s.token=? AND ${firebaseSessionWhere}`).bind(token,now.toISOString()).first<{projectId:string;uid:string;email:string|null}>()
 })
}
