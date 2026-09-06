import assert from 'node:assert/strict'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

// 実共有関数＋実migrationを一時ローカルD1に適用する。外部AIやremote D1は使わない。
const temp = await mkdtemp(join(tmpdir(), 'ai-payment-household-'))
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-07-08', d1Databases: { DB: 'household' }, d1Persist: false })
try {
  const output = join(temp, 'api.mjs')
  await build({ stdin: { contents: "export * from './cloudflare/worker/src/ai-diagnosis-store.ts';export * from './cloudflare/worker/src/payment-status.ts'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: output })
  const api = await import(pathToFileURL(output).href)
  const db = await mf.getD1Database('DB')
  for (const file of (await readdir('cloudflare/worker/migrations')).filter(file => file.endsWith('.sql')).sort()) {
    await db.exec((await readFile(`cloudflare/worker/migrations/${file}`, 'utf8')).replace(/--[^\n]*/g, '').replace(/\s+/g, ' '))
  }
  const a = { householdId: (await db.prepare("SELECT id FROM households WHERE legacy_auth_key='legacy'").first()).id, person: null, authMethod: 'password' }
  const b = { householdId: 'B', person: 'wife', authMethod: 'passkey' }
  await db.prepare("INSERT INTO households(id,created_at) VALUES('B','now')").run()
  await db.prepare("INSERT INTO ai_execution_guard(household_id,id,usage_date,daily_count,updated_at) VALUES('B',1,'1970-01-01',0,'now')").run()
  await db.prepare("INSERT INTO ai_diagnosis_source_revision(household_id,id,revision,updated_at) VALUES('B',1,0,'now')").run()
  const runtime = { now: () => new Date('2026-09-05T00:00:00Z'), randomUUID: () => crypto.randomUUID() }
  for (const context of [a, b]) {
    await db.prepare("INSERT INTO incomes(household_id,id,month,label,amount,person,created_at,updated_at) VALUES(?,?,'202609','給与',1000,'husband','now','now')").bind(context.householdId, context.householdId + '-income').run()
    await db.prepare("INSERT INTO expenses(household_id,id,month,label,amount,person,created_at,updated_at) VALUES(?,?,'202609','食費',-100,'wife','now','now')").bind(context.householdId, context.householdId + '-expense').run()
  }
  const before = await api.getDiagnosisContext(db, a, '202609')
  assert.equal(before.incomes.length, 1)
  await db.prepare("UPDATE incomes SET amount=2000 WHERE household_id='B'").run()
  assert.deepEqual(await api.getDiagnosisContext(db, a, '202609'), before)
  for (const context of [a,b]) assert.deepEqual(await api.acquireDiagnosisLease(db, runtime, context, '202609', 'same'), { acquired: true })
  await assert.rejects(api.saveExpenseCategories(db, runtime, a, '202609', 'same', [{ expenseIds: [a.householdId+'-expense','B-expense'], category: 'groceries', expectedLabel: '食費' }]))
  await api.saveExpenseCategories(db, runtime, a, '202609', 'same', [{ expenseIds: [a.householdId+'-expense'], category: 'groceries', expectedLabel: '食費' }])
  assert.equal((await api.getDiagnosisContext(db, a, '202609')).sourceRevision, before.sourceRevision)
  const input = { runToken: 'same', inputHash: 'hash', analysisVersion: 'v1', diagnosis: { household: 'a' }, expectedSourceRevision: before.sourceRevision }
  await api.saveDiagnosis(db, runtime, a, '202609', input)
  assert.equal(await api.getSavedDiagnosis(db, b, '202609'), null)
  assert.equal((await db.prepare("SELECT run_token FROM ai_execution_guard WHERE household_id='B'").first()).run_token, 'same')
  await assert.rejects(api.releaseDiagnosisLease(db, a, '202609', 'same'))
  await api.releaseDiagnosisLease(db, b, '202609', 'same')
  assert.equal((await api.acquireDiagnosisLease(db, runtime, a, '202608', 'cooldown')).reason, 'cooldown')
  await db.prepare('UPDATE ai_execution_guard SET daily_count=20,last_started_at=NULL WHERE household_id=?').bind(a.householdId).run()
  assert.equal((await api.acquireDiagnosisLease(db, runtime, a, '202608', 'quota')).reason, 'daily_limit')
  const later = { ...runtime, now: () => new Date('2026-09-06T00:00:00Z') }
  assert.equal((await api.acquireDiagnosisLease(db, later, a, '202609', 'next')).acquired, true)
  await db.prepare('UPDATE incomes SET amount=1100 WHERE household_id=?').bind(a.householdId).run()
  await assert.rejects(api.saveDiagnosis(db, later, a, '202609', { ...input, runToken: 'next' }), new RegExp(api.SOURCE_REVISION_CONFLICT_MESSAGE))
  await assert.rejects(api.releaseDiagnosisLease(db, a, '202609', 'same'))
  assert.equal((await db.prepare('SELECT run_token FROM ai_execution_guard WHERE household_id=?').bind(a.householdId).first()).run_token, 'next')
  // 同月・同額・同操作IDでも履歴と再送は自世帯のみ。
  await db.prepare("UPDATE incomes SET amount=1100 WHERE household_id='B'").run()
  const id = crypto.randomUUID()
  const record = async context => {
    const current = await api.getPaymentStatus(db, context, '202609')
    const input = { month: '202609', operationId: id, expectedRevision: current.revision, confirmedSignedYen: current.remainingSignedYen, paidOn: '2026-09-05' }
    return { input, result: await api.recordPayment(db, runtime, context, input) }
  }
  const [pa,pb] = await Promise.all([record(a),record(b)])
  assert.notEqual(pa.result.paymentId,pb.result.paymentId)
  assert.deepEqual(await api.recordPayment(db,runtime,a,pa.input),pa.result)
  assert.deepEqual(await api.recordPayment(db,runtime,b,pb.input),pb.result)
  const statusB=await api.getPaymentStatus(db,b,'202609')
  assert.equal(statusB.payments.length,1)
  assert.equal(statusB.payments[0].snapshot.incomes[0].id,'B-income')
  await assert.rejects(api.correctPayment(db,runtime,b,{month:'202609',operationId:crypto.randomUUID(),expectedRevision:statusB.revision,paymentId:pa.result.paymentId,reason:'越境',replacement:null}),e=>e.status===404)
  const snapshot = async () => Promise.all(['payment_operations','payment_records','payment_voids','month_payment_revisions'].map(async table=>(await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results))
  const old=await snapshot()
  await assert.rejects(api.correctPayment(db,{...runtime,randomUUID:()=>pa.result.paymentId},b,{month:'202609',operationId:crypto.randomUUID(),expectedRevision:statusB.revision,paymentId:pb.result.paymentId,reason:'後段衝突',replacement:{signedYen:1,paidOn:'2026-09-05'}}))
  assert.deepEqual(await snapshot(),old)
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[])
  console.log('実D1 AI/payment: 同月世帯独立・分類RETURNING・stale/lease/cooldown/quota・同operation ID並列再送・snapshot・越境404・後段rollback成功')
} finally { await mf.dispose(); await rm(temp, { recursive: true, force: true }) }
