import assert from 'node:assert/strict'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

// 本番・開発DBへは接続せず、毎回独立したローカルD1で実関数を検証する。
const temp = await mkdtemp(join(tmpdir(),'payment-d1-'))
const mf = new Miniflare({ modules:true, script:'export default { fetch() { return new Response("test") } }', compatibilityDate:'2026-07-08', d1Databases:{DB:'payment-test'}, d1Persist:false })
try {
  const output = join(temp,'payment.mjs')
  await build({
    stdin: {
      contents: `
        export * from './cloudflare/worker/src/payment-status.ts'
        export * from './cloudflare/worker/src/records.ts'
        export * from './cloudflare/worker/src/copy-month.ts'
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: output,
  })
  const api = await import(pathToFileURL(output).href)
  const db = await mf.getD1Database('DB')
  // D1 execは一行ごとに実行するため、トリガー全体を含むmigrationを一行に正規化する。
  for (const name of (await readdir('cloudflare/worker/migrations')).filter(n=>n.endsWith('.sql')).sort()) {
    const sql = (await readFile(`cloudflare/worker/migrations/${name}`,'utf8')).replace(/--[^\n]*/g,'').replace(/\s+/g,' ')
    await db.exec(sql)
  }
  const runtime = {randomUUID:()=>crypto.randomUUID(),now:()=>new Date('2026-09-05T00:00:00Z')}
  const actor = {person:null,authMethod:'password'}
  const month = '202609'
  const status = () => api.getPaymentStatus(db,month)
  const record = async (overrides={}) => {
    const current = await status()
    const input = {month,operationId:crypto.randomUUID(),expectedRevision:current.revision,confirmedSignedYen:current.remainingSignedYen,paidOn:'2026-09-05',...overrides}
    return {input,result:await api.recordPayment(db,runtime,input,actor)}
  }
  assert.equal((await status()).state,'unnecessary')
  await db.prepare('INSERT INTO incomes(id,month,label,amount,person,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind('income',month,'給与',31000,'husband','now','now').run()
  assert.equal((await status()).revision,1)
  const first = await record()
  assert.equal((await status()).state,'paid')
  // 記録が先なら編集は成功し、過去snapshotは変更されない。
  await db.prepare('UPDATE incomes SET amount=40000 WHERE id=?').bind('income').run()
  assert.equal((await status()).remainingSignedYen,4500)
  assert.equal((await status()).payments[0].snapshot.incomes[0].amount,31000)
  assert.deepEqual(await api.recordPayment(db,runtime,first.input,actor),first.result)
  await assert.rejects(api.recordPayment(db,runtime,{...first.input,paidOn:'2026-09-04'},actor),e=>e.status===409)
  assert.deepEqual(await api.getPaymentOperation(db,month,first.input.operationId),first.result)
  assert.equal(await api.getPaymentOperation(db,'202610',first.input.operationId),null)
  // 編集が先なら古い見積りを拒否する。
  await assert.rejects(record({expectedRevision:1,confirmedSignedYen:15500}),e=>e.status===409)
  const second = await record()
  assert.equal((await status()).state,'paid')
  // 訂正を一括確定し、取消済み行の再取消を拒否。
  const correction = {month,operationId:crypto.randomUUID(),expectedRevision:(await status()).revision,paymentId:second.result.paymentId,reason:'実際の振込額へ訂正',replacement:{signedYen:4000,paidOn:'2026-09-04'}}
  await api.correctPayment(db,runtime,correction,actor)
  assert.equal((await status()).remainingSignedYen,500)
  await assert.rejects(api.correctPayment(db,runtime,{...correction,operationId:crypto.randomUUID(),expectedRevision:(await status()).revision},actor),e=>e.status===409)
  await assert.rejects(api.correctPayment(db,runtime,{...correction,operationId:crypto.randomUUID(),month:'202610'},actor),e=>e.status===404)
  // 全明細の追加・フラグ・月移動・削除がrevisionを更新する。
  for (const [table,flag] of [['expenses','is_carryover'],['carryovers','is_cleared']]) {
    let rev = (await status()).revision
    await db.prepare(`INSERT INTO ${table}(id,month,label,amount,person,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(table,month,table,-100,'wife','now','now').run()
    assert.equal((await status()).revision,++rev)
    await db.prepare(`UPDATE ${table} SET ${flag}=1 WHERE id=?`).bind(table).run()
    assert.equal((await status()).revision,++rev)
    await db.prepare(`UPDATE ${table} SET month='202610' WHERE id=?`).bind(table).run()
    assert.equal((await status()).revision,++rev)
    const moved = (await api.getPaymentStatus(db,'202610')).revision
    await db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(table).run()
    assert.equal((await api.getPaymentStatus(db,'202610')).revision,moved+1)
  }
  // 同時に二つの操作が同じrevisionを確認しても、片方だけ記録される。
  const beforeRace = await status()
  const concurrent = await Promise.allSettled([record({expectedRevision:beforeRace.revision}),record({expectedRevision:beforeRace.revision})])
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1)
  assert.equal(concurrent.filter(r=>r.status==='rejected' && r.reason.status===409).length,1)
  // 書込batchの後半を失敗させ、先行操作・取消が残らないことを検証。
  const before = await status()
  const operationId = crypto.randomUUID()
  await db.exec("CREATE TRIGGER payment_test_fail BEFORE INSERT ON payment_records BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END;")
  const active = before.payments.find(p=>!p.voidedAt)
  await assert.rejects(api.correctPayment(db,runtime,{month,operationId,expectedRevision:before.revision,paymentId:active.id,reason:'rollback検証',replacement:{signedYen:1,paidOn:'2026-09-05'}},actor),e=>e.status===500)
  assert.equal(await api.getPaymentOperation(db,month,operationId),null)
  assert.deepEqual(await status(),before)
  await db.exec('DROP TRIGGER payment_test_fail;')
  for (const table of ['payment_records','payment_operations','payment_voids']) {
    await assert.rejects(db.prepare(`DELETE FROM ${table}`).run(),/PAYMENT_IMMUTABLE/)
    await assert.rejects(db.prepare(`UPDATE ${table} SET created_at='changed'`).run(),/PAYMENT_IMMUTABLE/)
  }
  // 共有CRUDを通っても振込済み月の編集は成功し、全経路でrevisionが進む。
  const crudMonth = '202701'
  const getMonthStatus = targetMonth => api.getPaymentStatus(db, targetMonth)
  const recordMonth = async targetMonth => {
    const current = await getMonthStatus(targetMonth)
    return api.recordPayment(db, runtime, {
      month: targetMonth,
      operationId: crypto.randomUUID(),
      expectedRevision: current.revision,
      confirmedSignedYen: current.remainingSignedYen,
      paidOn: '2026-09-05',
    }, actor)
  }
  await api.createRecord(db, runtime, 'income', {
    month: crudMonth, label: '基準給与', amount: 1000, person: 'husband',
  })
  await recordMonth(crudMonth)
  assert.equal((await getMonthStatus(crudMonth)).state, 'paid')
  for (const type of ['income', 'expense', 'carryover']) {
    let revision = (await getMonthStatus(crudMonth)).revision
    const input = {
      month: crudMonth,
      label: `CRUD検証-${type}`,
      amount: type === 'income' ? 100 : -100,
      person: 'wife',
    }
    const created = await api.createRecord(db, runtime, type, input)
    assert.equal((await getMonthStatus(crudMonth)).revision, ++revision)
    await api.updateRecord(db, runtime, type, created.id, {
      ...input, label: `更新-${type}`, amount: type === 'income' ? 200 : -200,
    })
    assert.equal((await getMonthStatus(crudMonth)).revision, ++revision)
    if (type !== 'income') {
      const flag = type === 'expense' ? { isCarryover: true } : { isCleared: true }
      await api.patchRecordFlag(db, runtime, type, created.id, flag)
      assert.equal((await getMonthStatus(crudMonth)).revision, ++revision)
    }
    await api.deleteRecord(db, type, created.id)
    assert.equal((await getMonthStatus(crudMonth)).revision, ++revision)
    assert.equal((await getMonthStatus(crudMonth)).payments.length, 1)
  }
  assert.equal((await getMonthStatus(crudMonth)).state, 'paid')

  // コピー元とコピー先の双方が振込済みでもadd/全skip/replaceを実行できる。
  const sourceMonth = '202702'
  const targetMonth = '202703'
  await api.createRecord(db, runtime, 'income', {
    month: sourceMonth, label: 'コピー給与', amount: 2000, person: 'husband',
  })
  await api.createRecord(db, runtime, 'expense', {
    month: sourceMonth, label: 'コピー支出', amount: -200, person: 'wife',
  })
  await api.createRecord(db, runtime, 'carryover', {
    month: sourceMonth, label: 'コピー繰越', amount: -300, person: 'wife',
  })
  await recordMonth(sourceMonth)
  await api.createRecord(db, runtime, 'income', {
    month: targetMonth, label: 'コピー先給与', amount: 1000, person: 'husband',
  })
  await recordMonth(targetMonth)
  const sourceBeforeCopy = await getMonthStatus(sourceMonth)
  const targetBeforeCopy = await getMonthStatus(targetMonth)
  const preview = await api.getCopyMonthPreview(db, sourceMonth, targetMonth)
  const copyInput = {
    sourceMonth,
    targetMonth,
    includeCarryover: true,
    selectedItems: preview.items.map(item => ({ ...item, itemCopyMode: 'withAmount' })),
  }
  const added = await api.copyMonthData(db, runtime, { ...copyInput, mode: 'add' })
  assert.equal(added.success, true)
  assert.deepEqual(added.copied, { incomes: 1, expenses: 1, carryovers: 1 })
  const afterAdd = await getMonthStatus(targetMonth)
  assert.equal(afterAdd.revision, targetBeforeCopy.revision + 3)
  const skipped = await api.copyMonthData(db, runtime, { ...copyInput, mode: 'skip' })
  assert.deepEqual(skipped.copied, { incomes: 0, expenses: 0, carryovers: 0 })
  assert.deepEqual(skipped.skipped, { incomes: 1, expenses: 1, carryovers: 1 })
  assert.equal((await getMonthStatus(targetMonth)).revision, afterAdd.revision)
  const replaced = await api.copyMonthData(db, runtime, { ...copyInput, mode: 'replace' })
  assert.equal(replaced.success, true)
  assert.deepEqual(replaced.copied, { incomes: 1, expenses: 1, carryovers: 1 })
  const afterReplace = await getMonthStatus(targetMonth)
  assert.equal(afterReplace.revision, afterAdd.revision + 7)
  assert.deepEqual(afterReplace.payments, targetBeforeCopy.payments)
  assert.deepEqual(await getMonthStatus(sourceMonth), sourceBeforeCopy)
  const emptyCopyMonth = '202704'
  await api.copyMonthData(db, runtime, { ...copyInput, targetMonth: emptyCopyMonth, mode: 'add' })
  assert.equal((await getMonthStatus(emptyCopyMonth)).payments.length, 0)
  assert.equal((await getMonthStatus(emptyCopyMonth)).state, 'unpaid')

  // 読取batch終了と書込batch開始の間に、別リクエストの編集を明示挿入する。
  const interleavedMonth = '202705'
  const interleavedIncome = await api.createRecord(db, runtime, 'income', {
    month: interleavedMonth, label: '競合給与', amount: 1000, person: 'husband',
  })
  const beforeInterleaved = await getMonthStatus(interleavedMonth)
  let editInserted = false
  const interleavedDb = {
    prepare: query => db.prepare(query),
    batch: async statements => {
      const result = await db.batch(statements)
      if (!editInserted) {
        editInserted = true
        await api.updateRecord(db, runtime, 'income', interleavedIncome.id, {
          label: '競合給与', amount: 1200, person: 'husband',
        })
      }
      return result
    },
  }
  const interleavedOperationId = crypto.randomUUID()
  await assert.rejects(api.recordPayment(interleavedDb, runtime, {
    month: interleavedMonth,
    operationId: interleavedOperationId,
    expectedRevision: beforeInterleaved.revision,
    confirmedSignedYen: beforeInterleaved.remainingSignedYen,
    paidOn: '2026-09-05',
  }, actor), error => error.status === 409)
  assert.equal(editInserted, true)
  assert.equal(await api.getPaymentOperation(db, interleavedMonth, interleavedOperationId), null)
  assert.equal((await getMonthStatus(interleavedMonth)).payments.length, 0)
  assert.equal((await getMonthStatus(interleavedMonth)).remainingSignedYen, 600)

  // 同じ操作キーの同時送信は、同じ結果と一つの支払だけに収束する。
  const beforeDuplicate = await getMonthStatus(interleavedMonth)
  const duplicateInput = {
    month: interleavedMonth,
    operationId: crypto.randomUUID(),
    expectedRevision: beforeDuplicate.revision,
    confirmedSignedYen: beforeDuplicate.remainingSignedYen,
    paidOn: '2026-09-05',
  }
  const duplicates = await Promise.all([
    api.recordPayment(db, runtime, duplicateInput, actor),
    api.recordPayment(db, runtime, duplicateInput, actor),
  ])
  assert.deepEqual(duplicates[0], duplicates[1])
  assert.equal((await getMonthStatus(interleavedMonth)).payments.length, 1)
  assert.equal((await getMonthStatus(interleavedMonth)).revision, beforeDuplicate.revision + 1)
  console.log('振込D1検証成功: 全migration・状態・再送・訂正・競合・CRUD/フラグ/コピー継続・snapshot・rollback・履歴不変')
} finally { await mf.dispose(); await rm(temp,{recursive:true,force:true}) }
