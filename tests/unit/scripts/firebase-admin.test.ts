import { describe, expect, it, vi } from 'vitest'
import { createFirebaseSqlite } from '../../helpers/firebase-sqlite'
import { completeFirebaseLogin } from '../../../cloudflare/worker/src/firebase-login'
import * as domain from '../../../cloudflare/worker/src/firebase-migrations'
import { approveFromVerifiedRequest, createWranglerDatabase, inspectRequest, parseArguments } from '../../../scripts/firebase-auth-admin.mjs'
import { verifyFirebaseIdentityState } from '../../../scripts/backup-identity.mjs'
import { BACKUP_MIGRATIONS, resolveBackupSchema } from '../../../scripts/backup-schema.mjs'
import { readFile } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const householdId='3975b870-bbfa-49fd-ae3d-d273c9f6e107'
describe('Firebase運用',()=>{
 it('秘密値のコマンド引数を受け付けず環境とDBの確認を要求する',()=>{
  expect(()=>parseArguments(['approve-migration','--code','secret'])).toThrow()
  expect(parseArguments(['approve-migration','--env','dev','--confirm-database','database','--input-file','/private/input'])).toMatchObject({environment:'dev',databaseId:'database'})
 })
 it('検証済み申請からのみ承認しWranglerへ非公開SQLファイルで渡す',async()=>{
  const context=createFirebaseSqlite({fixture:false}),directory=mkdtempSync(join(tmpdir(),'firebase-admin-test-'))
  try {
   const seconds=Math.floor(Date.now()/1000)
   const request=await completeFirebaseLogin(context.db,{now:()=>new Date(),randomUUID:()=>crypto.randomUUID()},
   {projectId:'project',uid:'uid',provider:'apple.com',email:null,authTime:seconds,issuedAt:seconds,expiresAt:seconds+3600},{mode:'login'})
   if(request.kind!=='migration_pending')throw Error()
   const transport=vi.fn(async(args:string[])=>{
    expect(args.join(' ')).not.toContain(request.code)
    const sql=await readFile(args[args.indexOf('--file')+1],'utf8')
    return [{success:true,results:(await context.db.prepare(sql).all()).results}]
   })
   const db=createWranglerDatabase({database_id:'fixture'},'dev',directory,transport)
   expect((await inspectRequest(db,{code:request.code,householdId})).requests[0].requestId).toBe(request.requestId)
   await approveFromVerifiedRequest(db,domain,'approve-migration',{requestId:request.requestId,code:request.code,approvedBy:'operator',confirmationRef:'record',householdId,legacySlot:'existing-member-1',defaultPerson:'husband'})
   expect(await context.db.prepare('SELECT status FROM firebase_migration_requests').first()).toEqual({status:'approved'})
   const authenticated=await completeFirebaseLogin(context.db,{now:()=>new Date(),randomUUID:()=>crypto.randomUUID()},
     {projectId:'project',uid:'uid',provider:'apple.com',email:null,authTime:seconds,issuedAt:seconds,expiresAt:seconds+3600},{mode:'login'})
   if(authenticated.kind!=='authenticated')throw Error()
   const inspection=await inspectRequest(db,{code:request.code,householdId})
   expect(inspection.existingPeople[0]).toMatchObject({membershipId:authenticated.session.membershipId,projectId:'project'})
   expect(inspection.legacyEnrollments).toContainEqual({legacySlot:'existing-member-1',consumedUserId:authenticated.session.userId})
  } finally {context.sqlite.close();rmSync(directory,{recursive:true,force:true})}
 })
 it('0015は23表を必須にして復元時のFirebase整合性異常を拒否する',()=>{
  const names=BACKUP_MIGRATIONS.map((row:{name:string})=>row.name)
  const tables=BACKUP_MIGRATIONS.flatMap((row)=>row.tables)
  expect(resolveBackupSchema(tables,names).stage).toBe('0015')
  expect(()=>resolveBackupSchema(tables.filter((name:string)=>name!=='firebase_identities'),names)).toThrow()
  expect(()=>verifyFirebaseIdentityState(()=>[{invalid_floors:1,invalid_sessions:0}])).toThrow()
  expect(()=>verifyFirebaseIdentityState(()=>[{invalid_floors:0,invalid_sessions:1}])).toThrow()
  expect(()=>verifyFirebaseIdentityState(()=>[{invalid_floors:0,invalid_sessions:0}])).not.toThrow()
 })
})

import { executeFirebaseFinalizationCommand } from '../../../scripts/firebase-auth-admin.mjs'
import * as finalization from '../../../cloudflare/worker/src/google-finalization'
import { finalizationFixture } from '../../helpers/google-finalization'
it('Firebaseの停止reviewはprojectと環境・DBを固定し明示停止だけで旧認証を終了する', async () => {
 const context=createFirebaseSqlite({fixture:false})
 try {
  const {input}=await finalizationFixture(context.db,{now:()=>new Date(),randomUUID:()=>crypto.randomUUID()})
  const options={command:'review-finalize',environment:'dev',databaseId:'fixture',projectId:'fixture-project'}
  await expect(executeFirebaseFinalizationCommand(context.db,finalization,{...options,projectId:'other'},input)).rejects.toThrow()
  const review=await executeFirebaseFinalizationCommand(context.db,finalization,options,input)
  expect(await context.db.prepare('SELECT legacy_auth_disabled_at FROM households').first()).toEqual({legacy_auth_disabled_at:null})
  await expect(executeFirebaseFinalizationCommand(context.db,finalization,{...options,command:'finalize',environment:'production'},review)).rejects.toThrow()
  expect((await executeFirebaseFinalizationCommand(context.db,finalization,{...options,command:'finalize'},review)).kind).toBe('finalized')
 } finally {context.sqlite.close()}
})
