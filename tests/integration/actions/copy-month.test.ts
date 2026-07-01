import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../../../tests/mocks/next'
import {
  mockSupabaseClient,
  clearSupabaseMocks,
} from '../../../tests/mocks/supabase'
import { mockRevalidatePath } from '../../../tests/mocks/next'
import {
  copyMonthData,
} from '@/app/actions/copy-month'
import type { CopyMonthOptions } from '@/types'

describe('copy-month actions', () => {
  beforeEach(() => {
    clearSupabaseMocks()
    mockRevalidatePath.mockClear()
    vi.clearAllMocks()
  })

  describe('copyMonthData', () => {
    describe('addモード', () => {
      it('選択した項目をコピーする', async () => {
        // モックの設定
        const qb = mockSupabaseClient._queryBuilder
        // insert().then()の結果
        qb.insert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [
            {
              id: '1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.incomes).toBe(1)
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('incomes')
        expect(qb.insert).toHaveBeenCalledWith([
          {
            month: '202602',
            label: '給料',
            amount: 300000,
            person: 'husband',
          },
        ])
      })

      it('labelOnlyモードでは最小金額を設定する（収入は1）', async () => {
        const qb = mockSupabaseClient._queryBuilder
        qb.insert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [
            {
              id: '1',
              label: '給料',
              amount: 300000, // 元の金額
              person: 'husband',
              type: 'income',
              itemCopyMode: 'labelOnly', // 項目名のみ
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(qb.insert).toHaveBeenCalledWith([
          expect.objectContaining({
            amount: 1, // 最小金額
          }),
        ])
      })

      it('labelOnlyモードでは最小金額を設定する（支出は-1）', async () => {
        const qb = mockSupabaseClient._queryBuilder
        qb.insert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [
            {
              id: '1',
              label: '食費',
              amount: -50000,
              person: 'wife',
              type: 'expense',
              itemCopyMode: 'labelOnly',
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(qb.insert).toHaveBeenCalledWith([
          expect.objectContaining({
            amount: -1, // 支出の最小金額
          }),
        ])
      })

      it('収入と支出を同時にコピーする', async () => {
        const qb = mockSupabaseClient._queryBuilder
        qb.insert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [
            {
              id: '1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
            {
              id: '2',
              label: '食費',
              amount: -50000,
              person: 'wife',
              type: 'expense',
              itemCopyMode: 'withAmount',
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.incomes).toBe(1)
        expect(result.copied.expenses).toBe(1)
      })

      it('繰越フラグ付き支出はincludeCarryover経由で繰越テーブルにコピーされる', async () => {
        const qb = mockSupabaseClient._queryBuilder

        // copyCarryovers内のPromise.all:
        // 1. carryovers.select().eq(month) → resolve
        // 2. expenses.select().eq(month).eq(is_carryover) → chain, resolve
        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [],
          error: null,
        })
        qb.eq.mockReturnValueOnce(qb) // expenses.eq(month) → chain
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月未払い', amount: -30000, person: 'husband' },
          ],
          error: null,
        })

        qb.upsert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [],
          includeCarryover: true,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.carryovers).toBe(1)
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('carryovers')
      })

      it('繰越フラグ付き支出と繰越テーブルのレコードが両方コピーされる', async () => {
        const qb = mockSupabaseClient._queryBuilder

        // copyCarryovers内のPromise.all:
        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月繰越', amount: -10000, person: 'wife', is_cleared: false },
          ],
          error: null,
        })
        qb.eq.mockReturnValueOnce(qb) // expenses.eq(month) → chain
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月未払い', amount: -30000, person: 'husband' },
          ],
          error: null,
        })

        qb.insert.mockResolvedValue({ data: null, error: null })
        qb.upsert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [
            {
              id: '1',
              label: '食費',
              amount: -50000,
              person: 'wife',
              type: 'expense',
              itemCopyMode: 'withAmount',
            },
          ],
          includeCarryover: true,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.expenses).toBe(1)
        expect(result.copied.carryovers).toBe(2)
      })

      it('同一キーの繰越はコピー時に1件へ重複排除される', async () => {
        const qb = mockSupabaseClient._queryBuilder

        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月繰越', amount: -10000, person: 'husband', is_cleared: false },
            { label: '前月繰越', amount: -10000, person: 'husband', is_cleared: false },
          ],
          error: null,
        })
        qb.eq.mockReturnValueOnce(qb)
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月繰越', amount: -10000, person: 'husband' },
          ],
          error: null,
        })

        qb.upsert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [],
          includeCarryover: true,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.carryovers).toBe(1)
        expect(result.skipped.carryovers).toBe(2)
        expect(qb.upsert).toHaveBeenCalledWith(
          [
            {
              month: '202602',
              label: '前月繰越',
              amount: -10000,
              person: 'husband',
            },
          ],
          {
            onConflict: 'month,label,amount,person',
            ignoreDuplicates: true,
          }
        )
      })
    })

    describe('skipモード', () => {
      it('既存データと重複する項目をスキップする', async () => {
        const qb = mockSupabaseClient._queryBuilder

        // 既存データの取得をモック
        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [{ label: '給料', person: 'husband' }], // 既存の収入
          error: null,
        })
        qb.eq.mockResolvedValueOnce({
          data: [], // 既存の支出なし
          error: null,
        })
        qb.insert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'skip',
          selectedItems: [
            {
              id: '1',
              label: '給料', // 既存と重複
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
            {
              id: '2',
              label: 'ボーナス', // 新規
              amount: 100000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.skipped.incomes).toBe(1) // 給料がスキップ
        expect(result.copied.incomes).toBe(1) // ボーナスがコピー
      })
    })

    describe('replaceモード', () => {
      it('既存データを削除してからコピーする', async () => {
        const qb = mockSupabaseClient._queryBuilder
        qb.delete.mockReturnValue(qb)
        qb.eq.mockResolvedValue({ data: null, error: null })
        qb.insert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'replace',
          selectedItems: [
            {
              id: '1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        // deleteが呼ばれたことを確認
        expect(qb.delete).toHaveBeenCalled()
      })
    })

    describe('繰越のコピー', () => {
      it('includeCarryover=trueで繰越をコピーする', async () => {
        const qb = mockSupabaseClient._queryBuilder

        // copyCarryovers内のPromise.all:
        // 1. carryovers.select().eq(month) → eq call 1 (resolve)
        // 2. expenses.select().eq(month).eq(is_carryover) → eq call 2 (chain), eq call 3 (resolve)
        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月繰越', amount: -10000, person: 'husband', is_cleared: false },
          ],
          error: null,
        })
        qb.eq.mockReturnValueOnce(qb) // expenses.eq(month) → chain
        qb.eq.mockResolvedValueOnce({
          data: [],
          error: null,
        })

        // upsertの結果
        qb.upsert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [], // 収入・支出なし
          includeCarryover: true,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.carryovers).toBe(1)
      })

      it('清算済み繰越はコピーされずスキップされる', async () => {
        const qb = mockSupabaseClient._queryBuilder

        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月繰越', amount: -10000, person: 'husband', is_cleared: false },
            { label: '清算済み繰越', amount: -5000, person: 'wife', is_cleared: true },
          ],
          error: null,
        })
        qb.eq.mockReturnValueOnce(qb) // expenses.eq(month) → chain
        qb.eq.mockResolvedValueOnce({
          data: [],
          error: null,
        })

        // upsertの結果
        qb.upsert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [],
          includeCarryover: true,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.carryovers).toBe(1)
        expect(result.skipped.carryovers).toBe(1)
      })

      it('全て清算済みの場合はコピーされない', async () => {
        const qb = mockSupabaseClient._queryBuilder

        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '清算済み1', amount: -10000, person: 'husband', is_cleared: true },
            { label: '清算済み2', amount: -5000, person: 'wife', is_cleared: true },
          ],
          error: null,
        })
        qb.eq.mockReturnValueOnce(qb) // expenses.eq(month) → chain
        qb.eq.mockResolvedValueOnce({
          data: [],
          error: null,
        })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [],
          includeCarryover: true,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.carryovers).toBe(0)
        expect(result.skipped.carryovers).toBe(2)
      })

      it('includeCarryover=falseで繰越をスキップする', async () => {
        const qb = mockSupabaseClient._queryBuilder
        qb.insert.mockResolvedValue({ data: null, error: null })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(true)
        expect(result.copied.carryovers).toBe(0)
      })
    })

    describe('エラーハンドリング', () => {
      it('収入挿入エラー時にエラーを返す', async () => {
        const qb = mockSupabaseClient._queryBuilder
        qb.insert.mockResolvedValueOnce({
          data: null,
          error: { message: 'Insert failed' },
        })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [
            {
              id: '1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(false)
        expect(result.error).toContain('収入の挿入に失敗')
      })

      it('支出挿入エラー時にエラーを返す', async () => {
        const qb = mockSupabaseClient._queryBuilder
        // 収入挿入は成功
        qb.insert.mockResolvedValueOnce({ data: null, error: null })
        // 支出挿入は失敗
        qb.insert.mockResolvedValueOnce({
          data: null,
          error: { message: 'Insert failed' },
        })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [
            {
              id: '1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
            {
              id: '2',
              label: '食費',
              amount: -50000,
              person: 'wife',
              type: 'expense',
              itemCopyMode: 'withAmount',
            },
          ],
          includeCarryover: false,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(false)
        expect(result.error).toContain('支出の挿入に失敗')
      })

      it('繰越の挿入エラー時にエラーを返す', async () => {
        const qb = mockSupabaseClient._queryBuilder

        // copyCarryovers内のPromise.all:
        qb.select.mockReturnValue(qb)
        qb.eq.mockResolvedValueOnce({
          data: [
            { label: '前月繰越', amount: -10000, person: 'husband', is_cleared: false },
          ],
          error: null,
        })
        qb.eq.mockReturnValueOnce(qb) // expenses.eq(month) → chain
        qb.eq.mockResolvedValueOnce({
          data: [],
          error: null,
        })

        // 繰越挿入は失敗
        qb.upsert.mockResolvedValueOnce({
          data: null,
          error: { message: 'Insert failed' },
        })

        const options: CopyMonthOptions = {
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          selectedItems: [],
          includeCarryover: true,
        }

        const result = await copyMonthData(options)

        expect(result.success).toBe(false)
        expect(result.error).toContain('繰越の挿入に失敗')
      })
    })

    it('作成後にrevalidatePathが呼ばれる', async () => {
      const qb = mockSupabaseClient._queryBuilder
      qb.insert.mockResolvedValue({ data: null, error: null })

      const options: CopyMonthOptions = {
        sourceMonth: '202601',
        targetMonth: '202602',
        mode: 'add',
        selectedItems: [
          {
            id: '1',
            label: '給料',
            amount: 300000,
            person: 'husband',
            type: 'income',
            itemCopyMode: 'withAmount',
          },
        ],
        includeCarryover: false,
      }

      await copyMonthData(options)

      expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    })
  })
})
