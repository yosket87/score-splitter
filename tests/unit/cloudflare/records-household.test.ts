import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRecordsSqlite } from '../../helpers/records-sqlite'
import { createRecord, listRecordsByMonth, listMonthlyAmounts, updateRecord, deleteRecord, patchRecordFlag } from '../../../cloudflare/worker/src/records'
import { copyMonthData, getCopyMonthPreview } from '../../../cloudflare/worker/src/copy-month'
import type { D1DatabaseLike } from '../../../cloudflare/worker/src/d1'
const A = { householdId: 'A' }, B = { householdId: 'B' }
const runtime = { randomUUID: () => crypto.randomUUID(), now: () => new Date('2026-09-05') }
let fixture: ReturnType<typeof createRecordsSqlite>
let db: D1DatabaseLike
const seed = async (context = A, type: 'income' | 'expense' | 'carryover' = 'income', extra = {}) => createRecord(db, runtime, context, type, { month: '202608', label: '同名', amount: type === 'income' ? 100 : -100, person: 'husband', ...extra })
const options = async (extra = {}) => {
  const preview = await getCopyMonthPreview(db, A, '202608', '202609')
  return { sourceMonth: '202608', targetMonth: '202609', mode: 'replace', includeCarryover: true, carryoverFingerprint: preview.carryoverFingerprint, selectedItems: preview.items.map(item => ({ ...item, itemCopyMode: 'withAmount' })), ...extra }
}
const snapshot = () => ['incomes', 'expenses', 'carryovers'].map(t => fixture.sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all())
const inject = (sql: string) => {
  const real = db
  db = { prepare: real.prepare, batch: async (statements) => { fixture.sqlite.exec(sql); return real.batch(statements) } }
}
beforeEach(() => { fixture = createRecordsSqlite(); db = fixture.db })
afterEach(() => fixture.sqlite.close())
describe('明細・コピーの世帯境界と原子性', () => {
  it.each(['income', 'expense', 'carryover'] as const)('%sの全CRUDを分離する', async (type) => {
    const a = await seed(A, type), b = await seed(B, type)
    expect(await listRecordsByMonth(db, A, type, '202608')).toEqual([a])
    for (const id of [b.id, 'missing']) {
      await expect(updateRecord(db, runtime, A, type, id, { label: '改ざん', amount: type === 'income' ? 10 : -10, person: 'wife' })).rejects.toMatchObject({ status: 404 })
      await expect(deleteRecord(db, A, type, id)).rejects.toMatchObject({ status: 404 })
      if (type !== 'income')
        await expect(patchRecordFlag(db, runtime, A, type, id, { isCarryover: true, isCleared: true })).rejects.toMatchObject({ status: 404 })
    }
    expect(await listRecordsByMonth(db, B, type, '202608')).toEqual([b])
    await deleteRecord(db, A, type, a.id)
    expect(await listRecordsByMonth(db, A, type, '202608')).toEqual([])
  })
  it('集計とpreviewを世帯内に限定する', async () => {
    await seed()
    await seed(B)
    await seed(B, 'expense')
    expect(await listMonthlyAmounts(db, A)).toEqual({ incomes: [{ month: '202608', amount: 100 }], expenses: [] })
    expect((await getCopyMonthPreview(db, A, '202608', '202609')).items).toHaveLength(1)
  })
  it.each(['foreign', 'missing', 'month', 'type'])('%sの選択混在はreplaceを含め404で無変更', async (kind) => {
    await seed()
    const b = await seed(kind === 'foreign' ? B : A, 'income', kind === 'month' ? { month: '202607' } : {})
    await seed(A, 'income', { month: '202609' })
    const input = await options()
    input.selectedItems.push({ ...input.selectedItems[0], id: kind === 'missing' ? 'missing' : b.id, type: kind === 'type' ? 'expense' : 'income', amount: kind === 'type' ? -100 : 100 })
    const before = snapshot()
    await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 404 })
    expect(snapshot()).toEqual(before)
  })
  it.each(["label='変更'", "person='wife'", 'amount=200'])('batch直前%sで409', async (change) => {
    const source = await seed()
    await seed(A, 'income', { month: '202609' })
    const input = await options()
    inject(`UPDATE incomes SET ${change} WHERE id='${source.id}'`)
    await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 409 })
    expect((await listRecordsByMonth(db, A, 'income', '202609'))[0].label).toBe('同名')
  })
  it('batch直前source削除で404', async () => {
    const source = await seed()
    const input = await options()
    inject(`DELETE FROM incomes WHERE id='${source.id}'`)
    await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 404 })
  })
  it.each(['income','expense'] as const)('labelOnlyの%sは元金額変更を許容し符号別の1を保存する', async type => {
    const source = await seed(A,type)
    const input = await options()
    input.selectedItems[0].itemCopyMode = 'labelOnly'
    input.selectedItems[0].amount = 999999
    inject(`UPDATE ${type==='income'?'incomes':'expenses'} SET amount=${type==='income'?200:-200} WHERE id='${source.id}'`)
    await copyMonthData(db, runtime, A, input)
    expect((await listRecordsByMonth(db, A, type, '202609'))[0].amount).toBe(type==='income'?1:-1)
  })
  it.each(['preview', 'batch'])('%s後の繰越変更を409で拒否', async (timing) => {
    const source = await seed(A, 'carryover')
    const input = await options()
    const sql = `UPDATE carryovers SET amount=-200 WHERE id='${source.id}'`
    if (timing === 'preview')
      fixture.sqlite.exec(sql)
    else
      inject(sql)
    await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 409 })
    expect(await listRecordsByMonth(db, A, 'carryover', '202609')).toEqual([])
  })
  it('同月はDBアクセス前400', async () => {
    await expect(copyMonthData({ prepare: () => { throw Error('DBアクセス') }, batch: async () => [] }, runtime, A, { sourceMonth: '202608', targetMonth: '202608', mode:'add', includeCarryover:false, selectedItems:[] })).rejects.toMatchObject({ status: 400 })
  })
  it.each(['add', 'skip', 'replace'])('%sの全コピー対象を世帯内に限定する', async (mode) => {
    await seed()
    await seed(A, 'expense')
    await seed(A, 'carryover')
    await seed(B)
    await seed(B, 'expense')
    await seed(B, 'carryover')
    await seed(B, 'income', { month: '202609' })
    await seed(B, 'expense', { month: '202609' })
    await seed(B, 'carryover', { month: '202609' })
    const foreignBefore = snapshot().map(rows => rows.filter(row => row.household_id === 'B'))
    const result = await copyMonthData(db, runtime, A, await options({ mode }))
    expect(result.copied).toEqual({ incomes: 1, expenses: 1, carryovers: 1 })
    expect(snapshot().map(rows => rows.filter(row => row.household_id === 'B'))).toEqual(foreignBefore)
  })
  it.each(['preview', 'batch'])('%s後に通常支出が繰越化したら409', async (timing) => {
    const source = await seed(A, 'expense')
    const input = await options({ includeCarryover: false })
    const sql = `UPDATE expenses SET is_carryover=1 WHERE id='${source.id}'`
    if (timing === 'preview')
      fixture.sqlite.exec(sql)
    else
      inject(sql)
    await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 409 })
  })
  it.each(['add', 'delete', 'clear', 'unclear'])('繰越%sをpreview・batchの両境界で検知', async (change) => {
    for (const timing of ['preview', 'batch']) {
      db = fixture.db
      fixture.sqlite.exec('DELETE FROM carryovers')
      const source = await seed(A, 'carryover', { isCleared: change === 'unclear' })
      const input = await options()
      const sql = change === 'add' ? `INSERT INTO carryovers(household_id,id,month,label,amount,person) VALUES('A','new','202608','追加',-20,'wife')` :
        change === 'delete' ? `DELETE FROM carryovers WHERE id='${source.id}'` : `UPDATE carryovers SET is_cleared=${change === 'clear' ? 1 : 0} WHERE id='${source.id}'`
      if (timing === 'preview')
        fixture.sqlite.exec(sql)
      else
        inject(sql)
      await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 409 })
      expect(await listRecordsByMonth(db, A, 'carryover', '202609')).toEqual([])
    }
  })
  it('繰越fingerprintを含めなくてもincludeCarryover=falseなら成功', async () => {
    await seed()
    await seed(A, 'carryover')
    await expect(copyMonthData(db, runtime, A, await options({ includeCarryover: false, carryoverFingerprint: undefined }))).resolves.toMatchObject({ copied: { incomes: 1, carryovers: 0 } })
  })
  it('不正な確認値から明細を生成しない', async () => {
    await seed()
    const input = await options()
    input.selectedItems[0].label = '改ざん'
    await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 409 })
    expect(await listRecordsByMonth(db, A, 'income', '202609')).toEqual([])
  })
  it('skipは同一リクエスト内の通常同キー項目を従来どおり両方コピーする', async () => {
    await seed()
    await seed()
    const result = await copyMonthData(db, runtime, A, await options({ mode: 'skip' }))
    expect(result.copied.incomes).toBe(2)
    expect((await copyMonthData(db, runtime, A, await options({ mode: 'skip' }))).skipped.incomes).toBe(2)
  })
  it('繰越fingerprint不一致があっても選択ID不存在は404を優先する', async () => {
    await seed()
    const input = await options({ carryoverFingerprint: '古い値' })
    input.selectedItems[0].id = 'missing'
    await expect(copyMonthData(db, runtime, A, input)).rejects.toMatchObject({ status: 404 })
  })
  it('replaceの途中失敗を全行rollbackする', async () => {
    await seed()
    await seed(A, 'income', { label: '二件目' })
    await seed(A, 'income', { month: '202609' })
    const before = snapshot()
    await expect(copyMonthData(db, { ...runtime, randomUUID: () => 'collision' }, A, await options())).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })
  it.each(['income', 'expense', 'carryover'] as const)('%sでbodyの所属を無視し認証世帯だけを更新する', async (type) => {
    const row = await seed(A, type, { householdId: 'B' })
    await updateRecord(db, runtime, A, type, row.id, { label: '変更', amount: type === 'income' ? 200 : -200, person: 'wife', householdId: 'B' })
    if (type !== 'income')
      await patchRecordFlag(db, runtime, A, type, row.id, { isCarryover: true, isCleared: true })
    expect((await listRecordsByMonth(db, A, type, '202608'))[0]).toMatchObject({ label: '変更', person: 'wife' })
    expect(await listRecordsByMonth(db, B, type, '202608')).toEqual([])
  })
})
