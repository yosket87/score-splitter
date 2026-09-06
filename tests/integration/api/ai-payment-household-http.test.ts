import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { server } from '@/mocks/server'
import { getTable, initStore } from '@/mocks/db'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import { createHouseholdDataSqlite, householdA as a, householdB as b } from '../../helpers/household-data-sqlite'
import { diagnosisView } from '../../helpers/cloudflare-worker-fake'
const url = 'http://mock-worker.local'
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
for (const backend of ['D1','MSW']) describe(`${backend} AI/paymentのDB session境界`, () => {
  it('sessionなしを拒否し、同月AIの読取・lease・分類・保存・releaseを世帯内に限定する', async () => {
    const { fixture, request } = setup(backend)
    try {
      for (const path of ['/ai-diagnoses/202609/context','/ai-diagnoses/202609','/months/202609/payment-status']) expect((await request(path,'GET',undefined,'')).status).toBe(401)
      const context = await (await request('/ai-diagnoses/202609/context?householdId=household-b')).json()
      expect(context.data.incomes).toHaveLength(1)
      for(const token of [tokenA, tokenB]) expect((await request('/ai-diagnoses/202609/lease','POST',{runToken:'same'},token)).status).toBe(200)
      expect((await request('/ai-diagnoses/categories','PATCH',{month:'202609',runToken:'same',assignments:[{expenseIds:['expense-b'],category:'groceries',expectedLabel:'食費'}]})).status).toBe(409)
      const save = { runToken:'same',inputHash:'hash',analysisVersion:'v1',expectedSourceRevision:context.data.sourceRevision,diagnosis:{...diagnosisView,month:'202609'} }
      expect((await request('/ai-diagnoses/202609','PUT',save)).status).toBe(200)
      expect(await (await request('/ai-diagnoses/202609','GET',undefined,tokenB)).json()).toEqual({data:null})
      expect((await request('/ai-diagnoses/202609/lease','DELETE',{runToken:'same'})).status).toBe(409)
      expect((await request('/ai-diagnoses/202609/lease','DELETE',{runToken:'same'},tokenB)).status).toBe(200)
    } finally { fixture.sqlite.close() }
  })
  it('同operation IDの振込再送・snapshot・訂正/取消を世帯ごとに分離する', async () => {
    const { fixture, request } = setup(backend)
    try {
      const id=crypto.randomUUID()
      const makeInput=async(token:string)=>{
        const status=await (await request('/months/202609/payment-status','GET',undefined,token)).json()
        return {month:'202609',operationId:id,expectedRevision:status.data.revision,confirmedSignedYen:status.data.remainingSignedYen,paidOn:'2026-09-05'}
      }
      const inputA=await makeInput(tokenA), inputB=await makeInput(tokenB)
      const pa=await (await request('/months/202609/payments','POST',inputA)).json()
      // Aだけに存在する操作番号はBの結果照会で取得できない。
      expect(await (await request('/months/202609/payment-operations/'+id,'GET',undefined,tokenB)).json()).toEqual({ data: null })
      const pb=await (await request('/months/202609/payments','POST',inputB,tokenB)).json()
      expect(pa.data.paymentId).not.toBe(pb.data.paymentId)
      expect(await (await request('/months/202609/payments','POST',inputA)).json()).toEqual(pa)
      expect(await (await request('/months/202609/payment-operations/'+id,'GET',undefined,tokenB)).json()).toEqual(pb)
      const own=await (await request('/months/202609/payment-status')).json()
      expect(own.data.payments).toHaveLength(1)
      expect(own.data.payments[0].actor).toEqual({person:null,authMethod:'password'})
      expect(own.data.payments[0].snapshot.incomes[0].id).toBe('income-a')
      for(const replacement of [null,{signedYen:10,paidOn:'2026-09-05'}]) {
        expect((await request('/months/202609/payment-corrections','POST',{month:'202609',operationId:crypto.randomUUID(),expectedRevision:pb.data.revision,paymentId:pa.data.paymentId,reason:'訂正',replacement},tokenB)).status).toBe(404)
      }
    } finally { fixture.sqlite.close() }
  })
})
function setup(backend: string) {
  const fixture=createHouseholdDataSqlite()
  initStore()
  for(const table of ['incomes','expenses','carryovers']) getTable(table).length=0
  getTable('households').push({id:b.householdId,created_at:'now'})
  getTable('ai_execution_guard').push({household_id:b.householdId,id:1,run_token:null,run_expires_at:null,last_started_at:null,usage_date:'1970-01-01',daily_count:0})
  getTable('ai_diagnosis_source_revision').push({household_id:b.householdId,id:1,revision:0})
  for(const [context, token, suffix] of [[a,tokenA,'a'],[b,tokenB,'b']] as const) {
    fixture.sqlite.prepare('INSERT INTO sessions(token,person,auth_method,expires_at,created_at,household_id) VALUES(?,NULL,?,?,?,?)').run(token,'password','2099-01-01','now',context.householdId)
    getTable('sessions').push({token,person:null,auth_method:'password',expires_at:'2099-01-01',household_id:context.householdId})
    for(const table of ['incomes','expenses']) {
      const id=(table==='incomes'?'income-':'expense-')+suffix
      const amount=table==='incomes'?1000:-100
      fixture.sqlite.prepare(`INSERT INTO ${table}(household_id,id,month,label,amount,person,created_at,updated_at) VALUES(?,?,'202609','食費',?,'husband','now','now')`).run(context.householdId,id,amount)
      getTable(table).push({household_id:context.householdId,id,month:'202609',label:'食費',amount,person:'husband',created_at:'now',updated_at:'now',is_carryover:false})
    }
    Object.assign(getTable('ai_diagnosis_source_revision').find(row=>row.household_id===context.householdId)!,{revision:2})
    getTable('month_payment_revisions').push({household_id:context.householdId,month:'202609',revision:2})
  }
  const request=async(path:string,method='GET',body?:unknown,token=tokenA)=>{
    const init={method,headers:{authorization:'Bearer mock-worker-token','x-household-session':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}
    return backend==='MSW'?fetch(url+path,init):handleRequest(new Request(url+path,init),{DB:fixture.db,WORKER_API_TOKEN:'mock-worker-token'},{now:()=>new Date('2026-09-05T00:00:00Z')})
  }
  return {fixture,request}
}
