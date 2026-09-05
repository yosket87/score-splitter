import { describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import {
  FakeD1Database,
  createEnv,
  createRequest,
} from '../../helpers/cloudflare-worker-fake'

describe('Cloudflare Worker 記録・月コピーAPI', () => {
  it('指定月の収入一覧を返す', async () => {
    const response = await handleRequest(
      createRequest('/incomes?month=202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 'income-1',
          month: '202601',
          label: '給料',
          amount: 300000,
          person: 'husband',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('本番の通常Expense APIはAI内部3列を露出せず公開keyだけ返す', async () => {
    const db = new FakeD1Database({
      expenses: [{
        id: 'expense-with-ai-category',
        month: '202601',
        label: '家賃',
        amount: -120000,
        person: 'wife',
        is_carryover: 0,
        ai_category: 'housing',
        ai_category_source: 'ai',
        ai_categorized_at: '2026-01-05T00:00:00.000Z',
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-05T00:00:00.000Z',
      }],
    })
    const response = await handleRequest(
      createRequest('/expenses?month=202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: Array<Record<string, unknown>> }
    expect(Object.keys(payload.data[0]).sort()).toEqual([
      'amount',
      'createdAt',
      'id',
      'isCarryover',
      'label',
      'month',
      'person',
    ])
    expect(JSON.stringify(payload)).not.toMatch(
      /ai_category|aiCategory|ai_category_source|aiCategorySource|ai_categorized_at|aiCategorizedAt/
    )
  })

  it('通常レコードAPIでも実在しない月をDB操作前に400で拒否する', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest('/incomes?month=202600', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )

    expect(response.status).toBe(400)
    expect(db.executed).toHaveLength(0)
  })

  it('収入作成時にIDと日時をWorker側で生成する', async () => {
    const db = new FakeD1Database()
    const randomUUID = vi.fn(() => 'generated-id')
    const now = vi.fn(() => new Date('2026-02-03T04:05:06.000Z'))

    const response = await handleRequest(
      createRequest('/incomes', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202602',
          label: '副業',
          amount: 50000,
          person: 'wife',
        }),
      }),
      createEnv(db),
      { randomUUID, now }
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 'generated-id',
        month: '202602',
        label: '副業',
        amount: 50000,
        person: 'wife',
        createdAt: '2026-02-03T04:05:06.000Z',
      },
    })
    expect(db.executed.some((item) => item.query.startsWith('INSERT INTO incomes'))).toBe(true)
  })

  it.each([
    ['mode', { mode: 'invalid' }],
    ['selectedItems', { selectedItems: null }],
  ])('月コピーの%sが不正なら400を返す', async (_name, override) => {
    const response = await handleRequest(
      createRequest('/copy-month', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          includeCarryover: false,
          selectedItems: [],
          ...override,
        }),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: `${_name}が不正です` })
  })

  it.each([
    ['income', -1],
    ['expense', 1],
  ] as const)('月コピーの%sに不正な符号の金額を指定すると400を返す', async (type, amount) => {
    const response = await handleRequest(
      createRequest('/copy-month', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          includeCarryover: false,
          selectedItems: [
            {
              id: `${type}-1`,
              label: '不正金額',
              amount,
              person: 'husband',
              type,
              itemCopyMode: 'withAmount',
            },
          ],
        }),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'amountが不正です' })
  })

  it('月コピーのreplaceをD1 batchで実行する', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest('/copy-month', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'replace',
          includeCarryover: false,
          selectedItems: [
            {
              id: 'income-1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
          ],
        }),
      }),
      createEnv(db),
      {
        randomUUID: vi.fn(() => 'copied-income-id'),
        now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')),
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      copied: { incomes: 1, expenses: 0, carryovers: 0 },
      skipped: { incomes: 0, expenses: 0, carryovers: 0 },
    })
    expect(db.batched).toHaveLength(1)
    expect(db.batched[0].map((item) => item.query)).toEqual([
      'DELETE FROM incomes WHERE month = ?',
      expect.stringContaining('INSERT INTO incomes'),
    ])
    expect(db.currentSourceRevision).toBeGreaterThan(0)
  })

  it('月コピー時に同一キーの繰越を1件へ重複排除する', async () => {
    const db = new FakeD1Database({
      carryovers: [
        {
          id: 'carryover-1',
          month: '202601',
          label: '前月繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z',
        },
        {
          id: 'carryover-2',
          month: '202601',
          label: '前月繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-01-04T00:00:00.000Z',
          updated_at: '2026-01-04T00:00:00.000Z',
        },
      ],
      expenses: [
        {
          id: 'expense-1',
          month: '202601',
          label: '前月繰越',
          amount: -10000,
          person: 'husband',
          is_carryover: 1,
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    })

    const response = await handleRequest(
      createRequest('/copy-month', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          includeCarryover: true,
          selectedItems: [],
        }),
      }),
      createEnv(db),
      {
        randomUUID: vi.fn(() => 'copied-carryover-id'),
        now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')),
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      copied: { incomes: 0, expenses: 0, carryovers: 1 },
      skipped: { incomes: 0, expenses: 0, carryovers: 2 },
    })
    expect(db.batched[0].map((item) => item.query)).toEqual([
      expect.stringContaining('INSERT INTO carryovers'),
    ])
  })

  it('addモードはコピー先と重複する繰越だけをスキップして他項目をコピーする', async () => {
    const db = new FakeD1Database({
      carryovers: [
        {
          id: 'source-duplicate',
          month: '202601',
          label: '重複繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z',
        },
        {
          id: 'source-unique',
          month: '202601',
          label: '新規繰越',
          amount: -20000,
          person: 'wife',
          is_cleared: 0,
          created_at: '2026-01-04T00:00:00.000Z',
          updated_at: '2026-01-04T00:00:00.000Z',
        },
        {
          id: 'target-duplicate',
          month: '202602',
          label: '重複繰越',
          amount: -10000,
          person: 'husband',
          is_cleared: 0,
          created_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-01T00:00:00.000Z',
        },
      ],
    })

    const response = await handleRequest(
      createRequest('/copy-month', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceMonth: '202601',
          targetMonth: '202602',
          mode: 'add',
          includeCarryover: true,
          selectedItems: [
            {
              id: 'income-1',
              label: '給料',
              amount: 300000,
              person: 'husband',
              type: 'income',
              itemCopyMode: 'withAmount',
            },
            {
              id: 'expense-1',
              label: '家賃',
              amount: -120000,
              person: 'wife',
              type: 'expense',
              itemCopyMode: 'withAmount',
            },
          ],
        }),
      }),
      createEnv(db),
      {
        randomUUID: vi.fn()
          .mockReturnValueOnce('copied-income-id')
          .mockReturnValueOnce('copied-expense-id')
          .mockReturnValueOnce('copied-carryover-id'),
        now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')),
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      copied: { incomes: 1, expenses: 1, carryovers: 1 },
      skipped: { incomes: 0, expenses: 0, carryovers: 1 },
    })
    const carryoverInserts = db.batched[0].filter((item) =>
      item.query.startsWith('INSERT INTO carryovers')
    )
    expect(carryoverInserts).toHaveLength(1)
    expect(carryoverInserts[0].params).toContain('新規繰越')
  })

  it.each(['skip', 'replace'] as const)(
    '%sモードの既存繰越処理を維持する',
    async (mode) => {
      const db = new FakeD1Database({
        carryovers: [
          {
            id: 'source-carryover',
            month: '202601',
            label: '前月繰越',
            amount: -10000,
            person: 'husband',
            is_cleared: 0,
            created_at: '2026-01-03T00:00:00.000Z',
            updated_at: '2026-01-03T00:00:00.000Z',
          },
          {
            id: 'target-carryover',
            month: '202602',
            label: '前月繰越',
            amount: -10000,
            person: 'husband',
            is_cleared: 0,
            created_at: '2026-02-01T00:00:00.000Z',
            updated_at: '2026-02-01T00:00:00.000Z',
          },
        ],
      })

      const response = await handleRequest(
        createRequest('/copy-month', {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sourceMonth: '202601',
            targetMonth: '202602',
            mode,
            includeCarryover: true,
            selectedItems: [],
          }),
        }),
        createEnv(db),
        {
          randomUUID: vi.fn(() => 'copied-carryover-id'),
          now: vi.fn(() => new Date('2026-02-03T04:05:06.000Z')),
        }
      )

      await expect(response.json()).resolves.toMatchObject(
        mode === 'skip'
          ? {
              copied: { carryovers: 0 },
              skipped: { carryovers: 1 },
            }
          : {
              copied: { carryovers: 1 },
              skipped: { carryovers: 0 },
            }
      )
      if (mode === 'replace') {
        expect(db.batched[0].map((item) => item.query)).toEqual([
          'DELETE FROM carryovers WHERE month = ?',
          expect.stringContaining('INSERT INTO carryovers'),
        ])
      }
    }
  )


})
