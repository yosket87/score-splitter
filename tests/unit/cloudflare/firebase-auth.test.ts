import { afterEach, describe, expect, it } from 'vitest'
import { createFirebaseSqlite } from '../../helpers/firebase-sqlite'
import { legacyHouseholdId } from '../../helpers/identity-sqlite'
import { completeFirebaseLogin } from '../../../cloudflare/worker/src/firebase-login'
import { approveFirebaseMigration, approveFirebaseRecovery, getFirebaseMigrationDisplay } from '../../../cloudflare/worker/src/firebase-migrations'
import { readFirebaseSession } from '../../../cloudflare/worker/src/firebase-session'
import { revokeFirebaseSessions } from '../../../cloudflare/worker/src/firebase-revocation'
import type { VerifiedFirebaseIdentity } from '../../../src/lib/auth/firebase-token'
const contexts: ReturnType<typeof createFirebaseSqlite>[] = []
const setup = () => { const context = createFirebaseSqlite({ fixture: false }); contexts.push(context); return context }
const runtime = { now: () => new Date(), randomUUID: () => crypto.randomUUID() }
const identity = (uid = 'firebase-one'): VerifiedFirebaseIdentity => ({ projectId: 'test-project', uid, provider: 'google.com', email: 'one@example.com', authTime: Math.floor(Date.now()/1000), issuedAt: Math.floor(Date.now()/1000), expiresAt: Math.floor(Date.now()/1000)+3600 })
const approval = { approvedBy: 'operator', confirmationRef: 'record', householdId: legacyHouseholdId, legacySlot: 'existing-member-1' as const, defaultPerson: 'husband' as const }
async function enroll(db: ReturnType<typeof setup>['db'], value = identity()) {
 const pending = await completeFirebaseLogin(db,runtime,value,{mode:'login'})
 if (pending.kind!=='migration_pending') throw Error('pending')
 await approveFirebaseMigration(db,runtime,{...approval,requestId:pending.requestId,code:pending.code})
 const result = await completeFirebaseLogin(db,runtime,value,{mode:'login'})
 if (result.kind!=='authenticated') throw Error('authenticated')
 return result.session
}
afterEach(() => contexts.splice(0).forEach(context => context.sqlite.close()))
describe('Firebase D1',()=> {
 it('UIDに固定した承認を一度消費し同UIDの別providerも同じユーザーへ解決する',async()=>{
  const {db}=setup(); const session=await enroll(db)
  const second=await completeFirebaseLogin(db,runtime,{...identity(),provider:'apple.com'},{mode:'login'})
  expect(second.kind==='authenticated'&&second.session.userId).toBe(session.userId)
  expect(await readFirebaseSession(db,session.token,new Date())).toMatchObject({userId:session.userId})
  expect((await db.prepare("SELECT status FROM firebase_migration_requests").first()) ).toEqual({status:'consumed'})
 })
 it('全端末ログアウトで本人だけを失効し旧auth_time再利用を拒否する',async()=>{
  const {db}=setup(); const value=identity(); const session=await enroll(db,value)
  await revokeFirebaseSessions(db,runtime,session.token)
  expect(await readFirebaseSession(db,session.token,new Date())).toBeNull()
  await expect(completeFirebaseLogin(db,runtime,value,{mode:'login'})).rejects.toThrow()
 })
 it('refreshは同UIDの有効Cookie必須、loginはfresh auth_time必須',async()=>{
  const {db}=setup(); const session=await enroll(db)
  await expect(completeFirebaseLogin(db,runtime,identity('other'),{mode:'login',currentToken:session.token})).rejects.toThrow()
  await expect(completeFirebaseLogin(db,runtime,identity(),{mode:'refresh'})).rejects.toThrow()
  await expect(completeFirebaseLogin(db,runtime,{...identity(),authTime:Math.floor(Date.now()/1000)-301},{mode:'login'})).rejects.toThrow()
  expect((await completeFirebaseLogin(db,runtime,identity(),{mode:'refresh',currentToken:session.token})).kind).toBe('authenticated')
 })
 it('最終session失敗でユーザー・所属・承認消費をすべてrollbackする',async()=>{
  const {db,sqlite}=setup(); const value=identity()
  const pending=await completeFirebaseLogin(db,runtime,value,{mode:'login'}); if(pending.kind!=='migration_pending') throw Error()
  await approveFirebaseMigration(db,runtime,{...approval,requestId:pending.requestId,code:pending.code})
  sqlite.exec("CREATE TRIGGER injected BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'injected'); END")
  await expect(completeFirebaseLogin(db,runtime,value,{mode:'login'})).rejects.toThrow()
  expect(await db.prepare('SELECT COUNT(*) n FROM users').first()).toEqual({n:0})
  expect(await db.prepare('SELECT status FROM firebase_migration_requests').first()).toEqual({status:'approved'})
 })
 it('復旧は同userに新UIDを結合し旧identity履歴と旧Cookie失効を保持する',async()=>{
  const {db}=setup(); const session=await enroll(db)
  const old=await db.prepare('SELECT id FROM firebase_identities').first<{id:string}>()
  const next=identity('new-uid');const pending=await completeFirebaseLogin(db,runtime,next,{mode:'login'});if(pending.kind!=='migration_pending')throw Error()
  await approveFirebaseRecovery(db,runtime,{requestId:pending.requestId,code:pending.code,approvedBy:'operator',confirmationRef:'record',targetUserId:session.userId,expectedEpoch:0,expectedOldIdentityId:old!.id})
  expect(await completeFirebaseLogin(db,runtime,next,{mode:'login'})).toEqual({kind:'recovered',userId:session.userId})
  expect(await readFirebaseSession(db,session.token,new Date())).toBeNull()
  expect(await db.prepare('SELECT COUNT(*) n FROM firebase_identities').first()).toEqual({n:2})
 })
 it('session期限はIDtokenのexp以下かつ最大1時間に制限する',async()=>{
  const {db}=setup();const value={...identity(),expiresAt:Math.floor(Date.now()/1000)+25}
  const session=await enroll(db,value)
  expect(Date.parse(session.expiresAt)).toBe(value.expiresAt*1000)
  const long=await completeFirebaseLogin(db,runtime,{...identity(),expiresAt:Math.floor(Date.now()/1000)+7200},{mode:'login'})
  expect(long.kind==='authenticated'&&Date.parse(long.session.expiresAt)).toBeLessThanOrEqual(Date.now()+3600_000)
 })
 it('同時に同じ許可を消費しても成功は1件でユーザーも1名だけ',async()=>{
  const {db}=setup();const value=identity()
  const pending=await completeFirebaseLogin(db,runtime,value,{mode:'login'});if(pending.kind!=='migration_pending')throw Error()
  await approveFirebaseMigration(db,runtime,{...approval,requestId:pending.requestId,code:pending.code})
  let entered=0;let release!:()=>void
  const barrier=new Promise<void>(resolve=>{release=resolve})
  const race={prepare:db.prepare,batch:async(statements:Parameters<typeof db.batch>[0])=>{if(++entered===2)release();await barrier;return db.batch(statements)}}
  const result=await Promise.allSettled([completeFirebaseLogin(race,runtime,value,{mode:'login'}),completeFirebaseLogin(race,runtime,value,{mode:'login'})])
  expect(result.filter(item=>item.status==='fulfilled')).toHaveLength(1)
  expect(await db.prepare('SELECT COUNT(*) n FROM users').first()).toEqual({n:1})
 })
 it('既存Googleユーザーへの初回連携は同usersと所属を維持する',async()=>{
  const {db,sqlite}=setup();const now=new Date().toISOString()
  sqlite.prepare('INSERT INTO users(id,created_at,updated_at) VALUES(?,?,?)').run('google-user',now,now)
  sqlite.prepare("INSERT INTO google_identities(id,user_id,issuer,subject,created_at) VALUES('google-id','google-user','https://accounts.google.com','subject',?)").run(now)
  sqlite.prepare("INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES('member','google-user',?,'husband',?)").run(legacyHouseholdId,now)
  const pending=await completeFirebaseLogin(db,runtime,identity(),{mode:'login'});if(pending.kind!=='migration_pending')throw Error()
  await approveFirebaseMigration(db,runtime,{requestId:pending.requestId,code:pending.code,approvedBy:'operator',confirmationRef:'record',targetUserId:'google-user',expectedEpoch:0})
  const result=await completeFirebaseLogin(db,runtime,identity(),{mode:'login'})
  expect(result.kind==='authenticated'&&result.session.userId).toBe('google-user')
  expect(await db.prepare('SELECT COUNT(*) n FROM google_identities').first()).toEqual({n:1})
  expect(await db.prepare('SELECT COUNT(*) n FROM users').first()).toEqual({n:1})
 })
 it('旧epochの承認消費は拒否され新UIDの登録は残らない',async()=>{
  const {db}=setup();const session=await enroll(db)
  const old=await db.prepare('SELECT id FROM firebase_identities').first<{id:string}>()
  const value=identity('recovery'),pending=await completeFirebaseLogin(db,runtime,value,{mode:'login'});if(pending.kind!=='migration_pending')throw Error()
  await approveFirebaseRecovery(db,runtime,{requestId:pending.requestId,code:pending.code,approvedBy:'operator',confirmationRef:'record',targetUserId:session.userId,expectedEpoch:0,expectedOldIdentityId:old!.id})
  await revokeFirebaseSessions(db,runtime,session.token)
  await expect(completeFirebaseLogin(db,runtime,value,{mode:'login'})).rejects.toThrow()
  expect(await db.prepare('SELECT COUNT(*) n FROM firebase_identities').first()).toEqual({n:1})
 })
 it('直接SQLによる不正session、identity復活、floor巻戻しを拒否する',async()=>{
  const {db,sqlite}=setup();const session=await enroll(db)
  const original=sqlite.prepare('SELECT * FROM sessions WHERE token=?').get(session.token)!
  for(const patch of [{session_epoch:1},{firebase_auth_time:0},{expires_at:new Date(Date.now()+7200_000).toISOString()},{membership_id:'missing'},{oauth_attempt_sequence:1}]) {
   const row={...original,...patch,token:'b'.repeat(64)}
   expect(()=>sqlite.prepare(`INSERT INTO sessions(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row))).toThrow()
  }
  await revokeFirebaseSessions(db,runtime,session.token)
  expect(()=>sqlite.exec('UPDATE users SET firebase_auth_time_floor=0')).toThrow()
  sqlite.prepare('UPDATE firebase_identities SET revoked_at=?').run(new Date().toISOString())
  expect(()=>sqlite.exec('UPDATE firebase_identities SET revoked_at=NULL')).toThrow()
  expect(()=>sqlite.exec('DELETE FROM firebase_identities')).toThrow()
 })

 it('表示はブラウザ秘密値とcodeの両方を照合し失敗時は情報を返さない',async()=>{
  const {db}=setup(),pending=await completeFirebaseLogin(db,runtime,identity(),{mode:'login'});if(pending.kind!=='migration_pending')throw Error()
  expect(await getFirebaseMigrationDisplay(db,runtime,pending.requestId,pending.browserSecret,pending.code)).toMatchObject({status:'pending',code:pending.code})
  expect(await getFirebaseMigrationDisplay(db,runtime,pending.requestId,'a'.repeat(64),pending.code)).toBeNull()
  expect(await getFirebaseMigrationDisplay(db,runtime,pending.requestId,pending.browserSecret,'a'.repeat(64))).toBeNull()
 })
 it('復旧の最終消費更新0件でも旧identityとepochを全て戻す',async()=>{
  const {db,sqlite}=setup(),session=await enroll(db)
  const old=await db.prepare('SELECT id FROM firebase_identities').first<{id:string}>(),value=identity('replacement')
  const pending=await completeFirebaseLogin(db,runtime,value,{mode:'login'});if(pending.kind!=='migration_pending')throw Error()
  await approveFirebaseRecovery(db,runtime,{requestId:pending.requestId,code:pending.code,approvedBy:'operator',confirmationRef:'record',targetUserId:session.userId,expectedEpoch:0,expectedOldIdentityId:old!.id})
  sqlite.exec("CREATE TRIGGER ignore_consumed BEFORE UPDATE OF status ON firebase_migration_requests WHEN NEW.status='consumed' BEGIN SELECT RAISE(IGNORE); END")
  await expect(completeFirebaseLogin(db,runtime,value,{mode:'login'})).rejects.toThrow()
  expect(await readFirebaseSession(db,session.token,new Date())).not.toBeNull()
  expect(await db.prepare('SELECT revoked_at FROM firebase_identities').first()).toEqual({revoked_at:null})
  expect(await db.prepare('SELECT COUNT(*) n FROM firebase_identities').first()).toEqual({n:1})
 })

 it('GoogleとFirebaseの同じ旧メンバー枠の承認は順序にかかわらず排他になる',async()=>{
  for(const firebaseFirst of [true,false]) {
   const {db,sqlite}=setup(),now=new Date().toISOString(),expires=new Date(Date.now()+600_000).toISOString()
   const request=await completeFirebaseLogin(db,runtime,identity(),{mode:'login'});if(request.kind!=='migration_pending')throw Error()
   sqlite.prepare("INSERT INTO google_migration_requests(id,purpose,issuer,subject,code_hash,browser_binding_hash,created_at,expires_at) VALUES('google-request','legacy_enrollment','https://accounts.google.com','subject',?,?,?,?)").run('a'.repeat(64),'b'.repeat(64),now,expires)
   const google=()=>sqlite.prepare("UPDATE google_migration_requests SET status='approved',approved_at=?,approval_expires_at=?,approved_by='operator',confirmation_ref='record',approved_household_id=?,approved_default_person='husband',legacy_slot='existing-member-1' WHERE id='google-request'").run(now,expires,legacyHouseholdId)
   const firebase=()=>approveFirebaseMigration(db,runtime,{...approval,requestId:request.requestId,code:request.code})
   if(firebaseFirst){await firebase();expect(google).toThrow()}
   else {google();await expect(firebase()).rejects.toThrow()}
  }
 })

 it.each([-1, 0])('最新epochの復旧承認もauth_timeがfloorとの差%s秒なら全値を保持して拒否する',async(offset)=>{
  const {db,sqlite}=setup(),session=await enroll(db)
  await revokeFirebaseSessions(db,runtime,session.token)
  const user=await db.prepare('SELECT session_epoch,firebase_auth_time_floor FROM users WHERE id=?').bind(session.userId)
   .first<{session_epoch:number;firebase_auth_time_floor:number}>()
  const old=await db.prepare('SELECT id FROM firebase_identities WHERE user_id=?').bind(session.userId).first<{id:string}>()
  const replacement={...identity('replacement'),authTime:user!.firebase_auth_time_floor+offset}
  const pending=await completeFirebaseLogin(db,runtime,replacement,{mode:'login'});if(pending.kind!=='migration_pending')throw Error()
  await approveFirebaseRecovery(db,runtime,{requestId:pending.requestId,code:pending.code,approvedBy:'operator',confirmationRef:'record',targetUserId:session.userId,expectedEpoch:user!.session_epoch,expectedOldIdentityId:old!.id})
  const snapshot=()=>['users','firebase_identities','firebase_migration_requests','household_memberships','sessions']
   .map(table=>({table,rows:sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()}))
  const before=snapshot()
  await expect(completeFirebaseLogin(db,runtime,replacement,{mode:'login'})).rejects.toThrow()
  expect(snapshot()).toEqual(before)
  const nextSeconds=user!.firebase_auth_time_floor+1
  const nextRuntime={...runtime,now:()=>new Date(nextSeconds*1000)}
  expect(await completeFirebaseLogin(db,nextRuntime,{...replacement,authTime:nextSeconds,issuedAt:nextSeconds},{mode:'login'}))
   .toEqual({kind:'recovered',userId:session.userId})
  expect(await db.prepare('SELECT COUNT(*) n FROM firebase_identities').first()).toEqual({n:2})
 })

})
