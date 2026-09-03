import { describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import {
  FakeD1Database,
  type FakeExpenseRow,
  acquireLeaseForTest,
  createEnv,
  createRequest,
  diagnosisView,
} from '../../helpers/cloudflare-worker-fake'
import { invalidAiWireCases } from '../../fixtures/ai-diagnosis-wire-cases'
import { savedDiagnosisGetCases } from '../../fixtures/saved-diagnosis-get-cases'

describe('Cloudflare Worker AI診断API', () => {
  it('共有シークレットがないリクエストを拒否する', async () => {
    const response = await handleRequest(createRequest('/incomes?month=202601'), createEnv())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: '認証に失敗しました',
    })
  })

  it('診断コンテキストを担当者なしで返す', async () => {
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601/context', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    expect(response.status).toBe(200)
    const payload = await response.json() as { data: { expenses: unknown[] } }
    expect(payload.data.expenses[0]).toEqual({
      id: 'expense-1',
      month: '202601',
      label: '家賃',
      amount: -120000,
      isCarryover: false,
      aiCategory: null,
    })
    expect(payload.data.expenses[0]).not.toHaveProperty('person')
  })

  it('保存済み診断がない月はnullを返す', async () => {
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: null })
  })

  it('strict検証済みの保存済み診断を返す', async () => {
    const db = new FakeD1Database({
      diagnoses: [
        {
          month: '202601',
          result_json: JSON.stringify(diagnosisView),
          input_hash: 'hash-1',
          analysis_version: 'v1',
          updated_at: '2026-01-20T12:00:00.000Z',
        },
      ],
    })
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        diagnosis: diagnosisView,
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        updatedAt: '2026-01-20T12:00:00.000Z',
      },
    })
  })

  it.each(savedDiagnosisGetCases)('$nameをMSW GETと同じstatus/bodyで返す', async ({
    path,
    seedMonth,
    diagnosis,
    inputHash,
    analysisVersion,
    expectedStatus,
    expectedBody,
  }) => {
    const db = new FakeD1Database({
      diagnoses: [
        {
          month: seedMonth,
          result_json: JSON.stringify(diagnosis),
          input_hash: inputHash,
          analysis_version: analysisVersion,
          updated_at: '2026-01-20T12:00:00.000Z',
        },
      ],
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await handleRequest(
      createRequest(path, {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    consoleError.mockRestore()

    expect(response.status).toBe(expectedStatus)
    await expect(response.json()).resolves.toEqual(expectedBody)
  })

  it('有効な実行リースがある場合は409を返す', async () => {
    const db = new FakeD1Database()
    const requestLease = (runToken: string) =>
      handleRequest(
        createRequest('/ai-diagnoses/202601/lease', {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ runToken }),
        }),
        createEnv(db),
        {
          randomUUID: vi.fn(() => 'diagnosis-id'),
          now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')),
        }
      )

    const first = await requestLease('first-run')
    const second = await requestLease('second-run')

    expect(first.status).toBe(200)
    await expect(first.json()).resolves.toEqual({ success: true })
    expect(second.status).toBe(409)
    await expect(second.json()).resolves.toEqual({ error: '診断を実行中です' })
  })

  it('異なる月の同時実行も世帯全体で1件に制限する', async () => {
    const db = new FakeD1Database()
    const requestLease = (month: string, runToken: string) =>
      handleRequest(
        createRequest(`/ai-diagnoses/${month}/lease`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ runToken }),
        }),
        createEnv(db),
        {
          randomUUID: vi.fn(() => `diagnosis-${month}`),
          now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')),
        }
      )

    const january = await requestLease('202601', 'january-run')
    const february = await requestLease('202602', 'february-run')

    expect(january.status).toBe(200)
    expect(february.status).toBe(409)
    await expect(february.json()).resolves.toEqual({ error: '診断を実行中です' })
  })

  it('解放後5秒のクールダウン中は429とRetry-Afterを返す', async () => {
    const db = new FakeD1Database()
    const at = (iso: string) => ({ now: vi.fn(() => new Date(iso)) })
    const leaseRequest = (month: string, runToken: string, iso: string) =>
      handleRequest(
        createRequest(`/ai-diagnoses/${month}/lease`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ runToken }),
        }),
        createEnv(db),
        at(iso)
      )

    expect((await leaseRequest('202601', 'run-secret-1', '2026-01-20T12:00:00.000Z')).status)
      .toBe(200)
    const released = await handleRequest(
      createRequest('/ai-diagnoses/202601/lease', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ runToken: 'run-secret-1' }),
      }),
      createEnv(db)
    )
    expect(released.status).toBe(200)

    const limited = await leaseRequest(
      '202602',
      'run-secret-2',
      '2026-01-20T12:00:01.000Z'
    )

    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('4')
    const body = await limited.text()
    expect(body).toBe(JSON.stringify({ error: 'AI診断の利用上限に達しました' }))
    expect(body).not.toMatch(/20260|run-secret/)
  })

  it('UTC日次20回は成功し21回目を429にし、翌UTC日は再開する', async () => {
    const db = new FakeD1Database()
    const baseTime = new Date('2026-01-20T12:00:00.000Z').getTime()
    const requestLease = (index: number, iso: string) =>
      handleRequest(
        createRequest('/ai-diagnoses/202601/lease', {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ runToken: `run-${index}` }),
        }),
        createEnv(db),
        { now: vi.fn(() => new Date(iso)) }
      )

    for (let index = 0; index < 20; index += 1) {
      const iso = new Date(baseTime + index * 5_000).toISOString()
      expect((await requestLease(index, iso)).status).toBe(200)
      expect((await handleRequest(
        createRequest('/ai-diagnoses/202601/lease', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ runToken: `run-${index}` }),
        }),
        createEnv(db)
      )).status).toBe(200)
    }

    const limited = await requestLease(
      20,
      new Date(baseTime + 20 * 5_000).toISOString()
    )
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0)

    const nextDay = await requestLease(21, '2026-01-21T00:00:00.000Z')
    expect(nextDay.status).toBe(200)
  })

  it('支出カテゴリを期待ラベルとの楽観ロック付きで保存する', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202601',
          runToken: 'run-1',
          assignments: [
            { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '家賃' },
          ],
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    const categoryUpdate = db.executed.find(({ query }) =>
      query.startsWith('WITH requested AS')
    )
    expect(categoryUpdate?.query).toContain('expenses.ai_category IS NULL')
    expect(categoryUpdate?.params.slice(1, 4)).toEqual([1, '202601', 'run-1'])
  })

  it('支出カテゴリ分類101件をWorker境界で400にしbatchを実行しない', async () => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202601',
          runToken: 'run-1',
          assignments: [
            {
              expenseIds: Array.from({ length: 60 }, (_, index) => `expense-${index}`),
              category: 'housing',
              expectedLabel: '家賃',
            },
            {
              expenseIds: Array.from({ length: 41 }, (_, index) => `expense-${index + 60}`),
              category: 'housing',
              expectedLabel: '家賃',
            },
          ],
        }),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: '一度に分類できる支出は100件までです',
    })
    expect(db.batched).toHaveLength(0)
  })

  it('支出カテゴリ分類100件をWorker境界で受理する', async () => {
    const expenses = Array.from({ length: 100 }, (_, index): FakeExpenseRow => ({
      id: `expense-${index}`,
      month: '202601',
      label: '家賃',
      amount: -1000,
      person: index % 2 === 0 ? 'husband' : 'wife',
      is_carryover: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }))
    const db = new FakeD1Database({ expenses })
    await acquireLeaseForTest(db)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202601',
          runToken: 'run-1',
          assignments: [
            {
              expenseIds: expenses.slice(0, 60).map(({ id }) => id),
              category: 'housing',
              expectedLabel: '家賃',
            },
            {
              expenseIds: expenses.slice(60).map(({ id }) => id),
              category: 'housing',
              expectedLabel: '家賃',
            },
          ],
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')) }
    )

    expect(response.status).toBe(200)
    expect(
      db.executed.some(({ query }) => query.startsWith('WITH requested AS'))
    ).toBe(true)
  })

  it('runTokenが一致する診断を保存し、成功後にリース解放を重ねない', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          runToken: 'run-1',
          inputHash: 'hash-1',
          analysisVersion: 'v1',
          diagnosis: diagnosisView,
          expectedSourceRevision: 0,
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: diagnosisView })
    const diagnosisUpdates = db.executed.filter(({ query }) =>
      query.startsWith('UPDATE ai_diagnoses')
    )
    expect(diagnosisUpdates).toHaveLength(1)
    expect(diagnosisUpdates[0].params.slice(4, 6)).toEqual(['202601', 'run-1'])
  })

  it('source revision不一致の古い診断保存を専用409にする', async () => {
    const db = new FakeD1Database({ sourceRevision: 1 })
    await acquireLeaseForTest(db)

    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          runToken: 'run-1',
          inputHash: 'hash-1',
          analysisVersion: 'v1',
          diagnosis: diagnosisView,
          expectedSourceRevision: 0,
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:00.000Z')) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: '診断対象データが更新されたため保存できません',
    })
  })

  it('分類待機中の支出追加をrefetchへ反映し初期revisionの保存を拒否する', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db)

    const inserted = await handleRequest(
      createRequest('/expenses', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202601',
          label: '分類待機中の支出',
          amount: -8000,
          person: 'husband',
          isCarryover: false,
        }),
      }),
      createEnv(db),
      {
        randomUUID: vi.fn(() => 'inserted-during-classification'),
        now: vi.fn(() => new Date('2026-01-20T12:00:01.000Z')),
      }
    )
    expect(inserted.status).toBe(201)

    const categorized = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202601',
          runToken: 'run-1',
          assignments: [{
            expenseIds: ['expense-1'],
            category: 'housing',
            expectedLabel: '家賃',
          }],
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:02.000Z')) }
    )
    expect(categorized.status).toBe(200)

    const contextResponse = await handleRequest(
      createRequest('/ai-diagnoses/202601/context', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv(db)
    )
    const contextPayload = await contextResponse.json() as {
      data: {
        sourceRevision: number
        expenses: Array<{ id: string; aiCategory: string | null }>
      }
    }
    expect(contextPayload.data.sourceRevision).toBe(1)
    expect(contextPayload.data.expenses).toContainEqual(
      expect.objectContaining({
        id: 'inserted-during-classification',
        aiCategory: null,
      })
    )

    const save = await handleRequest(
      createRequest('/ai-diagnoses/202601', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          runToken: 'run-1',
          inputHash: 'initial-context-hash',
          analysisVersion: 'v1',
          diagnosis: diagnosisView,
          expectedSourceRevision: 0,
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:00:03.000Z')) }
    )
    expect(save.status).toBe(409)
    await expect(save.json()).resolves.toEqual({
      error: '診断対象データが更新されたため保存できません',
    })
  })

  it('失敗経路で所有中の診断リースを解放する', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/202601/lease', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ runToken: 'run-1' }),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(db.executed.at(-1)).toEqual({
      query: `UPDATE ai_diagnoses
SET run_token = NULL, run_expires_at = NULL
WHERE month = ? AND run_token = ?`,
      params: ['202601', 'run-1'],
    })
  })

  it('分類対象のラベルが変わっていた場合は409を返す', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db)
    const response = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202601',
          runToken: 'run-1',
          assignments: [
            { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '旧家賃' },
          ],
        }),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: '分類中に支出が変更されました',
    })
  })

  it('2分の失効後に引き継がれた旧tokenは分類保存できない', async () => {
    const db = new FakeD1Database()
    await acquireLeaseForTest(db, 'old-run')
    const nextLease = await handleRequest(
      createRequest('/ai-diagnoses/202602/lease', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ runToken: 'new-run' }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:02:01.000Z')) }
    )
    expect(nextLease.status).toBe(200)

    const staleSave = await handleRequest(
      createRequest('/ai-diagnoses/categories', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          month: '202601',
          runToken: 'old-run',
          assignments: [
            { expenseIds: ['expense-1'], category: 'housing', expectedLabel: '家賃' },
          ],
        }),
      }),
      createEnv(db),
      { now: vi.fn(() => new Date('2026-01-20T12:02:01.000Z')) }
    )

    expect(staleSave.status).toBe(409)
  })

  it.each([
    [
      'expectedLabel欠落',
      '/ai-diagnoses/categories',
      'PATCH',
      { assignments: [{ expenseIds: ['expense-1'], category: 'housing' }] },
    ],
    [
      'person混入',
      '/ai-diagnoses/202601',
      'PUT',
      {
        runToken: 'run-1',
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        diagnosis: { ...diagnosisView, person: 'husband' },
      },
    ],
    [
      'リースbodyの未知キー',
      '/ai-diagnoses/202601/lease',
      'POST',
      { runToken: 'run-1', person: 'husband' },
    ],
  ])('%sをstrict body検証で400にする', async (_name, path, method, body) => {
    const response = await handleRequest(
      createRequest(path, {
        method,
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      createEnv()
    )

    expect(response.status).toBe(400)
  })

  it.each(invalidAiWireCases)('$nameをMSWと同じ400で拒否する', async ({
    path,
    method,
    body,
    rawBody,
  }) => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest(path, {
        method,
        headers: {
          authorization: 'Bearer secret-token',
          ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        },
        body: method === 'GET' ? undefined : (rawBody ?? JSON.stringify(body)),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(400)
    expect(db.executed).toHaveLength(0)
  })

  it.each([
    ['保存', '/ai-diagnoses/202601', 'PUT', {
      runToken: 'missing-run',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: diagnosisView,
      expectedSourceRevision: 0,
    }],
    ['解放', '/ai-diagnoses/202601/lease', 'DELETE', { runToken: 'missing-run' }],
  ])('失効リースの%sを409にする', async (_name, path, method, body) => {
    const response = await handleRequest(
      createRequest(path, {
        method,
        headers: {
          authorization: 'Bearer secret-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      createEnv()
    )

    expect(response.status).toBe(409)
  })

  it('診断APIでもBearer認証と月形式を検証する', async () => {
    const unauthorized = await handleRequest(
      createRequest('/ai-diagnoses/202601/context'),
      createEnv()
    )
    const invalidMonth = await handleRequest(
      createRequest('/ai-diagnoses/2026-01/context', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      createEnv()
    )

    expect(unauthorized.status).toBe(401)
    expect(invalidMonth.status).toBe(400)
  })

  it.each([
    ['context', '202600', 'GET', '/ai-diagnoses/202600/context', undefined],
    ['context', '202613', 'GET', '/ai-diagnoses/202613/context', undefined],
    ['lease', '202600', 'POST', '/ai-diagnoses/202600/lease', { runToken: 'run-1' }],
    ['lease', '202613', 'POST', '/ai-diagnoses/202613/lease', { runToken: 'run-1' }],
    ['save', '202600', 'PUT', '/ai-diagnoses/202600', {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: { ...diagnosisView, month: '202600' },
    }],
    ['save', '202613', 'PUT', '/ai-diagnoses/202613', {
      runToken: 'run-1',
      inputHash: 'hash-1',
      analysisVersion: 'v1',
      diagnosis: { ...diagnosisView, month: '202613' },
    }],
  ])('実在しない月の%s(%s)をDB操作前に400で拒否する', async (
    _route,
    _month,
    method,
    path,
    body
  ) => {
    const db = new FakeD1Database()
    const response = await handleRequest(
      createRequest(path, {
        method,
        headers: {
          authorization: 'Bearer secret-token',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      createEnv(db)
    )

    expect(response.status).toBe(400)
    expect(db.executed).toHaveLength(0)
  })


})
