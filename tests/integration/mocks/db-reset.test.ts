import { describe, expect, it, vi } from 'vitest'
import { seedData } from '@/mocks/data'

describe('モックDBのリセット', () => {
  it('別々に読み込まれたモジュールでも追加・編集・削除とセッションを初期化する', async () => {
    const handlerDb = await import('@/mocks/db')
    handlerDb.initStore()
    handlerDb.insertRows('incomes', [
      { month: '202612', label: 'テスト給料', amount: 300000, person: 'husband' },
    ])
    handlerDb.deleteRows('expenses', { label: 'eq.家賃' })
    handlerDb.updateRows('carryovers', { label: 'eq.前月繰越' }, { is_cleared: true })
    handlerDb.insertRows('sessions', [{ token: 'test-session' }])
    handlerDb.insertRows('ai_diagnoses', [{ month: '202612', result_json: '{}' }])
    expect(handlerDb.getTable('ai_diagnosis_source_revision')[0].revision).toBeGreaterThan(0)

    // instrumentationとリセットAPIが別々にDBモジュールを読み込む状況を再現する。
    vi.resetModules()
    const resetDb = await import('@/mocks/db')
    resetDb.initStore()

    expect(handlerDb.getTable('incomes')).toEqual(seedData.incomes)
    expect(handlerDb.getTable('expenses')).toEqual(seedData.expenses)
    expect(handlerDb.getTable('carryovers')).toEqual(seedData.carryovers)
    expect(handlerDb.getTable('sessions')).toEqual([])
    expect(handlerDb.getTable('ai_diagnoses')).toEqual([])
    expect(handlerDb.getTable('ai_diagnosis_source_revision')[0].revision).toBe(0)

    // 再初期化後も、どちらのモジュールから行った変更も参照できる。
    resetDb.insertRows('sessions', [{ token: 'new-session' }])
    expect(handlerDb.getTable('sessions')).toEqual([
      expect.objectContaining({ token: 'new-session' }),
    ])
    resetDb.insertRows('incomes', [{ month: '202612', amount: 100 }])
    expect(handlerDb.getTable('ai_diagnosis_source_revision')[0].revision).toBe(1)
  })
})
