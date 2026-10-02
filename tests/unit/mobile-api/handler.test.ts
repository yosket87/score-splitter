import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session:vi.fn(), verify:vi.fn(), complete:vi.fn(), create:vi.fn(), update:vi.fn(), remove:vi.fn(), flag:vi.fn(), list:vi.fn(), first:vi.fn(), all:vi.fn(), invalidate:vi.fn(), allow:vi.fn() }))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/api/backend',()=>({getDatabase:()=>({prepare:()=>({bind:()=>({first:mocks.first,all:mocks.all})})}),getRuntime:()=>({})}))
vi.mock('@/lib/auth/firebase-config',()=>({firebaseAuthConfig:()=>({client:{googleEnabled:true,appleEnabled:true}})}))
vi.mock('@/lib/auth/firebase-token',()=>({verifyFirebaseToken:mocks.verify,FirebaseVerificationError:class extends Error {}}))
vi.mock('@/lib/api/firebase-rate-limit',()=>({allowFirebaseExchange:mocks.allow}))
vi.mock('../../../cloudflare/worker/src/firebase-login',()=>({completeFirebaseLogin:mocks.complete}))
vi.mock('../../../cloudflare/worker/src/firebase-session',()=>({readFirebaseSession:mocks.session}))
vi.mock('../../../cloudflare/worker/src/sessions',()=>({deleteSession:mocks.remove}))
vi.mock('../../../cloudflare/worker/src/records',()=>({createRecord:mocks.create,updateRecord:mocks.update,deleteRecord:mocks.remove,patchRecordFlag:mocks.flag,listRecordsByMonth:mocks.list}))
vi.mock('@/app/actions/revalidation',()=>({revalidateHouseholdData:mocks.invalidate}))
import { handleMobileRequest } from '@/lib/mobile-api/handler'
const token = 'a'.repeat(64)
function request(method='GET',body?:unknown) {
 return new Request('https://app.test/api/v1', {method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
}
beforeEach(()=>{
 vi.resetAllMocks()
 mocks.session.mockResolvedValue({token,householdId:'household-a',authMethod:'firebase',expiresAt:'2026-10-01T17:00:00Z'})
 mocks.first.mockResolvedValue({month:'202610'})
 mocks.allow.mockResolvedValue(true)
 mocks.list.mockResolvedValue([])
})
describe('モバイルAPI認証と操作',()=>{
 it.each(['期限切れ','失効','所属削除'])('%sセッションを拒否する',async()=>{
  mocks.session.mockResolvedValue(null)
  expect((await handleMobileRequest(request(),['months'])).status).toBe(401)
  expect(mocks.list).not.toHaveBeenCalled()
 })
 it('Cookieだけの認証を拒否する',async()=>{
  const response=await handleMobileRequest(new Request('https://app.test',{headers:{cookie:`household_session=${token}`}}),['auth','session'])
  expect(response.status).toBe(401)
 })
 it('現在セッションはtokenを返さずno-store',async()=>{
  const response=await handleMobileRequest(request(),['auth','session'])
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect((await response.json()).data.token).toBeUndefined()
 })
 it('別世帯レコードは404で変更しない',async()=>{
  mocks.first.mockResolvedValue(null)
  expect((await handleMobileRequest(request('DELETE'),['expenses','other-id'])).status).toBe(404)
  expect(mocks.remove).not.toHaveBeenCalled()
 })
 it('作成は検証sessionの世帯と負数保存を使う',async()=>{
  mocks.create.mockResolvedValue({id:'new',month:'202610',amount:-100})
  const response=await handleMobileRequest(request('POST',{month:'202610',label:'食費',amount:100,person:'wife'}),['expenses'])
  expect(response.status).toBe(200)
  expect(mocks.create).toHaveBeenCalledWith(expect.anything(),expect.anything(),{householdId:'household-a'},'expense',expect.objectContaining({amount:-100}))
  expect(mocks.invalidate).toHaveBeenCalledWith('202610')
 })
 it('月詳細はサーバーで精算結果を計算する',async()=>{
  mocks.list.mockResolvedValueOnce([{id:'i',month:'202610',label:'給与',amount:100,person:'husband'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
  const response=await handleMobileRequest(request(),['months','202610'])
  expect((await response.json()).data.settlement.settlement).toBe(50)
 })
 it('月収支は繰越支出を含み清算済み繰越を除外する',async()=>{
  mocks.list
   .mockResolvedValueOnce([{id:'i',month:'202610',label:'給与',amount:1000,person:'husband'}])
   .mockResolvedValueOnce([
    {id:'e1',month:'202610',label:'食費',amount:-100,person:'husband',isCarryover:false},
    {id:'e2',month:'202610',label:'繰越扱い',amount:-200,person:'wife',isCarryover:true},
   ])
   .mockResolvedValueOnce([{id:'c',month:'202610',label:'前月分',amount:-50,person:'wife',isCleared:true}])
  const response=await handleMobileRequest(request(),['months','202610'])
  const {data}=await response.json()
  expect(data.monthBalance).toEqual({incomeTotal:1000,expenseTotal:-300,balance:700})
  expect(data.settlement.totalExpense).toBe(-150)
  expect(data.settlement.allowance).toBe(425)
 })
 it('未知UIDは移行申請を作らずWebへ案内する',async()=>{
  mocks.verify.mockResolvedValue({projectId:'project',uid:'unknown',provider:'google.com'})
  mocks.first.mockResolvedValue(null)
  const response=await handleMobileRequest(request('POST',{idToken:'signed',mode:'login'}),['auth','exchange'])
  expect(response.status).toBe(409)
  expect((await response.json()).error.code).toBe('web_link_required')
  expect(mocks.complete).not.toHaveBeenCalled()
 })
 it('refreshは現在の有効Bearerを必要とする',async()=>{
  mocks.verify.mockResolvedValue({projectId:'project',uid:'u',provider:'google.com'})
  mocks.session.mockResolvedValue(null)
  expect((await handleMobileRequest(request('POST',{idToken:'signed',mode:'refresh'}),['auth','exchange'])).status).toBe(401)
  expect(mocks.complete).not.toHaveBeenCalled()
 })
 it('認証済みloginはアプリsessionを返す',async()=>{
  mocks.verify.mockResolvedValue({projectId:'project',uid:'u',provider:'google.com'})
  mocks.complete.mockResolvedValue({kind:'authenticated',session:{token,householdId:'household-a'}})
  expect((await (await handleMobileRequest(request('POST',{idToken:'signed',mode:'login'}),['auth','exchange'])).json()).data.token).toBe(token)
 })
 it('本文への世帯注入を拒否する',async()=>{
  expect((await handleMobileRequest(request('POST',{month:'202610',label:'給与',amount:1,person:'husband',householdId:'other'}),['incomes'])).status).toBe(400)
  expect(mocks.create).not.toHaveBeenCalled()
 })
 it('一覧に繰越だけの月を含める',async()=>{
  mocks.all.mockResolvedValueOnce({results:[]}).mockResolvedValueOnce({results:[]}).mockResolvedValueOnce({results:[{month:'202610',amount:-100}]})
  const response=await handleMobileRequest(request(),['months'])
  expect((await response.json()).data.months).toEqual([{month:'202610',incomeTotal:0,expenseTotal:0,balance:0}])
 })
 it('更新で月変更を拒否する',async()=>{
  expect((await handleMobileRequest(request('PUT',{month:'202610',label:'給与',amount:1,person:'husband'}),['incomes','id'])).status).toBe(400)
  expect(mocks.update).not.toHaveBeenCalled()
 })
 it('更新とフラグ変更と削除が世帯を渡す',async()=>{
  mocks.update.mockResolvedValue({id:'id',amount:100})
  expect((await handleMobileRequest(request('PUT',{label:'給与',amount:100,person:'husband'}),['incomes','id'])).status).toBe(200)
  expect(mocks.update).toHaveBeenCalledWith(expect.anything(),expect.anything(),{householdId:'household-a'},'income','id',expect.objectContaining({amount:100}))
  expect((await handleMobileRequest(request('PATCH',{isCleared:true}),['carryovers','id'])).status).toBe(200)
  expect(mocks.flag).toHaveBeenCalledWith(expect.anything(),expect.anything(),{householdId:'household-a'},'carryover','id',{isCleared:true})
  expect((await handleMobileRequest(request('DELETE'),['incomes','id'])).status).toBe(200)
  expect(mocks.remove).toHaveBeenCalledWith(expect.anything(),{householdId:'household-a'},'income','id')
 })
 it('logoutは当該Bearerだけ削除する',async()=>{
  expect((await handleMobileRequest(request('POST'),['auth','logout'])).status).toBe(200)
  expect(mocks.remove).toHaveBeenCalledWith(expect.anything(),token)
 })
 it('認証交換をレート制限する',async()=>{
  mocks.allow.mockResolvedValue(false)
  expect((await handleMobileRequest(request('POST',{idToken:'signed',mode:'login'}),['auth','exchange'])).status).toBe(429)
  expect(mocks.verify).not.toHaveBeenCalled()
 })
 it('DB例外の秘密情報を隠す',async()=>{
  mocks.session.mockRejectedValue(new Error('secret-token'))
  const response=await handleMobileRequest(request(),['auth','session'])
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret-token')
 })

})
