import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFirebaseSqlite } from '../../helpers/firebase-sqlite'
import { legacyHouseholdId } from '../../helpers/identity-sqlite'
import { completeFirebaseLogin } from '../../../cloudflare/worker/src/firebase-login'
import { readFirebaseSession } from '../../../cloudflare/worker/src/firebase-session'
import { createRecord } from '../../../cloudflare/worker/src/records'
import type { VerifiedFirebaseIdentity } from '@/lib/auth/firebase-token'
const fixture = vi.hoisted(() => ({ db: null as unknown, verify: vi.fn() }))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/api/backend',()=>({getDatabase:()=>fixture.db,getRuntime:()=>({now:()=>new Date(),randomUUID:()=>crypto.randomUUID()})}))
vi.mock('@/lib/auth/firebase-config',()=>({firebaseAuthConfig:()=>({client:{googleEnabled:true,appleEnabled:true}})}))
vi.mock('@/lib/auth/firebase-token',()=>({verifyFirebaseToken:fixture.verify,FirebaseVerificationError:class extends Error{}}))
vi.mock('@/lib/api/firebase-rate-limit',()=>({allowFirebaseExchange:async()=>true}))
vi.mock('@/app/actions/revalidation',()=>({revalidateHouseholdData:vi.fn()}))
import { handleMobileRequest } from '@/lib/mobile-api/handler'
let context:ReturnType<typeof createFirebaseSqlite>
let token:string
const runtime={now:()=>new Date(),randomUUID:()=>crypto.randomUUID()}
const identity=(uid='uid-a'):VerifiedFirebaseIdentity=>({projectId:'test-project',uid,provider:'google.com',email:null,authTime:Math.floor(Date.now()/1000),issuedAt:Math.floor(Date.now()/1000),expiresAt:Math.floor(Date.now()/1000)+3600})
function request(method='GET',body?:unknown,bearer=token) {
 return new Request('https://app.test/api/v1',{method,headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
}
beforeEach(async()=>{
 context=createFirebaseSqlite({fixture:false});fixture.db=context.db
 const now=new Date().toISOString()
 context.sqlite.prepare("INSERT INTO households(id,created_at) VALUES('household-b',?)").run(now)
 context.sqlite.prepare("INSERT INTO ai_diagnosis_source_revision(household_id,id,revision,updated_at) VALUES('household-b',1,0,?)").run(now)
 for(const [suffix,household] of [['a',legacyHouseholdId],['b','household-b']]) {
  context.sqlite.prepare('INSERT INTO users(id,created_at,updated_at) VALUES(?,?,?)').run(`user-${suffix}`,now,now)
  context.sqlite.prepare('INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES(?,?,?,?,?)').run(`member-${suffix}`,`user-${suffix}`,household,'husband',now)
  context.sqlite.prepare('INSERT INTO firebase_identities(id,user_id,project_id,uid,created_at) VALUES(?,?,?,?,?)').run(`identity-${suffix}`,`user-${suffix}`,'test-project',`uid-${suffix}`,now)
 }
 const result=await completeFirebaseLogin(context.db,runtime,identity(),{mode:'login'})
 if(result.kind!=='authenticated')throw Error('session')
 token=result.session.token
 fixture.verify.mockResolvedValue(identity())
})
afterEach(()=>context.sqlite.close())
describe('モバイルAPI実D1境界',()=>{
 it.each(['login','refresh'])('%sで発行したセッションはIDトークン期限に依存せず365日間有効',async(mode)=>{
  fixture.verify.mockResolvedValue({...identity(),expiresAt:Math.floor(Date.now()/1000)+25})
  const response=await handleMobileRequest(request('POST',{idToken:'verified',mode}),['auth','exchange'])
  expect(response.status).toBe(200)
  const session=(await response.json()).data
  const row=await context.db.prepare('SELECT created_at FROM sessions WHERE token=?').bind(session.token).first<{created_at:string}>()
  const expiry=Date.parse(row!.created_at)+365*24*60*60*1000
  expect(Date.parse(session.expiresAt)).toBe(expiry)
  expect(await readFirebaseSession(context.db,session.token,new Date(expiry-1000))).not.toBeNull()
  expect(await readFirebaseSession(context.db,session.token,new Date(expiry))).toBeNull()
  context.sqlite.exec("UPDATE users SET session_epoch=session_epoch+1 WHERE id='user-a'")
  expect(await readFirebaseSession(context.db,session.token,new Date())).toBeNull()
 })

 it('DB移行後も365日超の発行と既存セッションの期限延長を拒否する',async()=>{
  const row=context.sqlite.prepare('SELECT expires_at FROM sessions WHERE token=?').get(token)
  expect(()=>context.sqlite.prepare("UPDATE sessions SET expires_at=datetime(created_at,'+365 days') WHERE token=?").run(token)).toThrow('FIREBASE_SESSION_LIFETIME')
  expect(()=>context.sqlite.prepare("INSERT INTO sessions SELECT ?,person,auth_method,datetime(created_at,'+366 days'),created_at,household_id,user_id,membership_id,session_epoch,oauth_attempt_sequence,firebase_identity_id,firebase_auth_time FROM sessions WHERE token=?").run('f'.repeat(64),token)).toThrow('FIREBASE_SESSION_INVALID')
  expect(context.sqlite.prepare('SELECT expires_at FROM sessions WHERE token=?').get(token)).toEqual(row)
 })
 it.each(['expired','revoked','epoch','membership'])('%sをGET/PUT/PATCH/DELETEすべて拒否する',async(reason)=>{
  if(reason==='expired')context.sqlite.prepare('UPDATE sessions SET expires_at=? WHERE token=?').run(new Date(Date.now()-1000).toISOString(),token)
  if(reason==='revoked')context.sqlite.prepare('UPDATE firebase_identities SET revoked_at=? WHERE id=?').run(new Date().toISOString(),'identity-a')
  if(reason==='epoch')context.sqlite.exec("UPDATE users SET session_epoch=session_epoch+1 WHERE id='user-a'")
  if(reason==='membership')context.sqlite.prepare('UPDATE household_memberships SET revoked_at=? WHERE id=?').run(new Date().toISOString(),'member-a')
  for(const method of ['GET','PUT','PATCH','DELETE'])expect((await handleMobileRequest(request(method),method==='GET'?['months','202610']:['expenses','id'])).status).toBe(401)
 })
 it('別世帯の明細を取得も変更もせず、本人のCRUDだけ成功する',async()=>{
  const other=await createRecord(context.db,runtime,{householdId:'household-b'},'expense',{month:'202610',label:'他世帯',amount:-200,person:'wife'})
  const detail=await (await handleMobileRequest(request(),['months','202610'])).json()
  expect(detail.data.expenses).toEqual([])
  for(const method of ['PUT','PATCH','DELETE'])expect((await handleMobileRequest(request(method,{label:'変更',amount:100,person:'husband',isCarryover:true}),['expenses',other.id])).status).toBe(404)
  const created=await (await handleMobileRequest(request('POST',{month:'202610',label:'食費',amount:100,person:'husband'}),['expenses'])).json()
  const id=created.data.id
  expect((await handleMobileRequest(request('PUT',{label:'夕食',amount:150,person:'wife'}),['expenses',id])).status).toBe(200)
  expect((await handleMobileRequest(request('PATCH',{isCarryover:true}),['expenses',id])).status).toBe(200)
  expect((await (await handleMobileRequest(request(),['months','202610'])).json()).data.expenses).toEqual([expect.objectContaining({amount:-150,isCarryover:true})])
  expect((await handleMobileRequest(request('DELETE'),['expenses',id])).status).toBe(200)
  expect(await context.db.prepare('SELECT label FROM expenses WHERE id=?').bind(other.id).first()).toEqual({label:'他世帯'})
 })
 it('refreshが旧Bearerを消費し新Bearerだけ有効になる',async()=>{
  const response=await handleMobileRequest(request('POST',{idToken:'verified',mode:'refresh'}),['auth','exchange'])
  expect(response.status).toBe(200)
  const next=(await response.json()).data.token
  expect(next).not.toBe(token)
  expect((await handleMobileRequest(request(),['auth','session'])).status).toBe(401)
  expect((await handleMobileRequest(request('GET',undefined,next),['auth','session'])).status).toBe(200)
 })
 it('別UIDのrefreshを拒否し旧sessionを維持する',async()=>{
  fixture.verify.mockResolvedValue(identity('uid-b'))
  expect((await handleMobileRequest(request('POST',{idToken:'verified',mode:'refresh'}),['auth','exchange'])).status).toBe(401)
  expect(await readFirebaseSession(context.db,token,new Date())).not.toBeNull()
 })
 it('同時refreshは原子的に一件だけ成功する',async()=>{
  let entered=0;let release!:()=>void
  const barrier=new Promise<void>(resolve=>{release=resolve})
  fixture.db={prepare:context.db.prepare,batch:async(statements:Parameters<typeof context.db.batch>[0])=>{if(++entered===2)release();await barrier;return context.db.batch(statements)}}
  const responses=await Promise.all([handleMobileRequest(request('POST',{idToken:'verified',mode:'refresh'}),['auth','exchange']),handleMobileRequest(request('POST',{idToken:'verified',mode:'refresh'}),['auth','exchange'])])
  expect(responses.map(item=>item.status).sort()).toEqual([200,401])
  expect(await readFirebaseSession(context.db,token,new Date())).toBeNull()
  expect(await context.db.prepare('SELECT COUNT(*) n FROM sessions').first()).toEqual({n:1})
 })
 it('失敗したrotationは新sessionも旧token削除もrollbackする',async()=>{
  context.sqlite.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'injected'); END")
  expect((await handleMobileRequest(request('POST',{idToken:'verified',mode:'refresh'}),['auth','exchange'])).status).toBe(401)
  expect(await readFirebaseSession(context.db,token,new Date())).not.toBeNull()
  expect(await context.db.prepare('SELECT COUNT(*) n FROM sessions').first()).toEqual({n:1})
 })
})
