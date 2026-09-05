import assert from 'node:assert/strict'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

// 毎回破棄するローカルD1だけで既存migrationと同じ制約・トリガーを検証する。
const temp = await mkdtemp(join(tmpdir(),'records-household-d1-'))
const mf = new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-07-08',d1Databases:{DB:'records-household-test'},d1Persist:false})
try {
  const output=join(temp,'records.mjs')
  await build({stdin:{contents:"export * from './cloudflare/worker/src/records.ts';export * from './cloudflare/worker/src/copy-month.ts'",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:output})
  const api=await import(pathToFileURL(output).href)
  const real=await mf.getD1Database('DB')
  for(const name of (await readdir('cloudflare/worker/migrations')).filter(name=>name.endsWith('.sql')).sort()) {
    await real.exec((await readFile(`cloudflare/worker/migrations/${name}`,'utf8')).replace(/--[^\n]*/g,'').replace(/\s+/g,' '))
  }
  const A={householdId:(await real.prepare("SELECT id FROM households WHERE legacy_auth_key='legacy'").first()).id},B={householdId:'B'}
  await real.prepare('INSERT INTO households(id,created_at) VALUES(?,?)').bind('B','2026-09-05').run()
  const runtime={randomUUID:()=>crypto.randomUUID(),now:()=>new Date('2026-09-05')}
  const seed=(context,type,month,label='同名',extra={})=>api.createRecord(real,runtime,context,type,{month,label,person:'husband',amount:type==='income'?100:-100,...extra})
  const input=async(sourceMonth='202608',extra={})=>{
    const preview=await api.getCopyMonthPreview(real,A,sourceMonth,'202609')
    return {sourceMonth,targetMonth:'202609',mode:'replace',includeCarryover:true,carryoverFingerprint:preview.carryoverFingerprint,selectedItems:preview.items.map(item=>({...item,itemCopyMode:'withAmount'})),...extra}
  }
  // 実トリガーが追加更新を行う場合も、フラグ更新・削除は成功件数を正しく扱う。
  for (const type of ['income','expense','carryover']) {
    const own = await seed(A,type,'202607',type)
    const other = await seed(B,type,'202607',type,{amount:type==='income'?200:-200})
    for (const id of [other.id,'missing']) {
      await assert.rejects(api.updateRecord(real,runtime,A,type,id,{label:'変更',amount:type==='income'?100:-100,person:'wife'}),e=>e.status===404)
      await assert.rejects(api.deleteRecord(real,A,type,id),e=>e.status===404)
      if(type!=='income') await assert.rejects(api.patchRecordFlag(real,runtime,A,type,id,{isCarryover:true,isCleared:true}),e=>e.status===404)
    }
    if(type!=='income') await api.patchRecordFlag(real,runtime,A,type,own.id,{isCarryover:true,isCleared:true})
    await api.deleteRecord(real,A,type,own.id)
    assert.equal((await api.listRecordsByMonth(real,B,type,'202607'))[0].id,other.id)
  }
  const source=await seed(A,'income','202608'),foreign=await seed(B,'income','202608')
  await seed(A,'income','202609'); await seed(B,'income','202609')
  const wrap=(sql,params=[])=>({prepare:sql=>real.prepare(sql),batch:async statements=>{await real.prepare(sql).bind(...params).run();return real.batch(statements)}})
  const records=async()=>Promise.all(['incomes','expenses','carryovers','month_payment_revisions','ai_diagnosis_source_revision'].map(async t=>(await real.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()).results))
  for(const id of [foreign.id,'missing']) {
    const request=await input();request.selectedItems.push({...request.selectedItems[0],id})
    const before=await records()
    await assert.rejects(api.copyMonthData(real,runtime,A,request),e=>e.status===404)
    assert.deepEqual(await records(),before)
  }
  const request=await input()
  await assert.rejects(api.copyMonthData(wrap('UPDATE incomes SET amount=200 WHERE household_id=? AND id=?',[A.householdId,source.id]),runtime,A,request),e=>e.status===409)
  assert.equal((await api.listRecordsByMonth(real,A,'income','202609'))[0].amount,100)
  await api.copyMonthData(real,runtime,A,await input())
  assert.equal((await api.listRecordsByMonth(real,A,'income','202609'))[0].amount,200)
  // コピー先の追加と削除はbatch内NOT EXISTSで判定する。
  const skip=await input('202608',{mode:'skip',includeCarryover:false})
  let result=await api.copyMonthData(wrap('DELETE FROM incomes WHERE household_id=? AND month=?',[A.householdId,'202609']),runtime,A,skip)
  assert.equal(result.copied.incomes,1)
  await real.prepare('DELETE FROM incomes WHERE household_id=? AND month=?').bind(A.householdId,'202609').run()
  result=await api.copyMonthData(wrap('INSERT INTO incomes(household_id,id,month,label,amount,person,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',[A.householdId,'racing-target','202609','同名',100,'husband','now','now']),runtime,A,skip)
  assert.equal(result.skipped.incomes,1)
  const carry=await seed(A,'carryover','202608','繰越')
  const carryInput=await input()
  await assert.rejects(api.copyMonthData(wrap('UPDATE carryovers SET is_cleared=1 WHERE household_id=? AND id=?',[A.householdId,carry.id]),runtime,A,carryInput),e=>e.status===409)
  // 二件目のINSERTが主キー衝突した場合、DELETE・一件目・両revisionを全て戻す。
  await seed(A,'income','202608','別項目')
  const rollbackInput=await input('202608',{includeCarryover:false})
  const before=await records()
  await assert.rejects(api.copyMonthData(real,{...runtime,randomUUID:()=> 'rollback-duplicate'},A,rollbackInput))
  assert.deepEqual(await records(),before)
  const deletedInput=await input('202608',{includeCarryover:false})
  await assert.rejects(api.copyMonthData(wrap('DELETE FROM incomes WHERE household_id=? AND id=?',[A.householdId,source.id]),runtime,A,deletedInput),e=>e.status===404)
  assert.equal((await api.listRecordsByMonth(real,B,'income','202608'))[0].id,foreign.id)
  console.log('ローカルD1: 世帯境界、source race、繰越race、target skip race、正常replace、revisionを含むrollbackを確認')
} finally {await mf.dispose();await rm(temp,{recursive:true,force:true})}
