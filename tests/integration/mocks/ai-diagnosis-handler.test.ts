import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getTable, initStore } from '@/mocks/db'
import { server } from '@/mocks/server'
import { invalidAiWireCases } from '../../fixtures/ai-diagnosis-wire-cases'
import { savedDiagnosisGetCases } from '../../fixtures/saved-diagnosis-get-cases'

const API_URL = 'http://mock-worker.local'
const AUTHORIZATION = 'Bearer mock-worker-token'
const jsonHeaders = {
  authorization: AUTHORIZATION,
  'content-type': 'application/json',
}

describe('AI家計診断のモックAPI', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => initStore())
  afterAll(() => server.close())

  it('対象月と直前3か月の診断contextを内部カテゴリ付き・担当者なしで返す', async () => {
    const response = await fetch(`${API_URL}/ai-diagnoses/202602/context`, {
      headers: { authorization: AUTHORIZATION },
    })

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      data: { targetMonth: string; expenses: Array<Record<string, unknown>> }
    }
    expect(payload.data.targetMonth).toBe('202602')
    expect(new Set(payload.data.expenses.map(({ month }) => month))).toEqual(
      new Set(['202602', '202601', '202512', '202511'])
    )
    expect(payload.data.expenses[0]).toHaveProperty('aiCategory')
    expect(JSON.stringify(payload)).not.toMatch(/"person"|husband|wife/)
  })

  it('通常Expense APIへAI内部カテゴリ3列を露出しない', async () => {
    Object.assign(getTable('expenses')[0], {
      ai_category: 'dining',
      ai_category_source: 'ai',
      ai_categorized_at: '2026-02-01T00:00:00.000Z',
    })

    const response = await fetch(`${API_URL}/expenses?month=202511`, {
      headers: { authorization: AUTHORIZATION },
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(JSON.stringify(payload)).not.toMatch(/aiCategory|ai_category|categorized/i)
  })

  it.each(savedDiagnosisGetCases)('$nameを本番GETと同じstatus/bodyで返す', async ({
    path,
    seedMonth,
    diagnosis,
    inputHash,
    analysisVersion,
    expectedStatus,
    expectedBody,
  }) => {
    getTable('ai_diagnoses').push({
      month: seedMonth,
      result_json: diagnosis,
      input_hash: inputHash,
      analysis_version: analysisVersion,
      updated_at: '2026-01-20T12:00:00.000Z',
    })

    const response = await fetch(`${API_URL}${path}`, {
      headers: { authorization: AUTHORIZATION },
    })

    expect(response.status).toBe(expectedStatus)
    await expect(response.json()).resolves.toEqual(expectedBody)
  })

  it('リース競合、分類の期待ラベル競合、runToken fenceを本番契約と同じ409で返す', async () => {
    const acquire = (month: string, runToken: string) =>
      fetch(`${API_URL}/ai-diagnoses/${month}/lease`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ runToken }),
      })

    expect((await acquire('202602', 'run-1')).status).toBe(200)
    expect((await acquire('202601', 'run-2')).status).toBe(409)

    const expense = getTable('expenses').find(({ month }) => month === '202602')
    const categoryConflict = await fetch(`${API_URL}/ai-diagnoses/categories`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        month: '202602',
        runToken: 'run-1',
        assignments: [{
          expenseIds: [expense?.id],
          category: 'dining',
          expectedLabel: '変更前ではないラベル',
        }],
      }),
    })
    expect(categoryConflict.status).toBe(409)

    const saveConflict = await fetch(`${API_URL}/ai-diagnoses/202602`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        runToken: 'run-2',
        inputHash: 'hash-1',
        analysisVersion: 'v1',
        diagnosis: {
          month: '202602',
          summaryText: '診断',
          currentExpenseTotal: 1,
          baselineExpenseAverage: null,
          unresolvedCarryoverTotal: 0,
          notableChanges: [],
          positivePoints: [],
          suggestions: [],
          dataSufficiency: 'full',
        },
      }),
    })
    expect(saveConflict.status).toBe(409)
  })

  it('mockも5秒cooldown・UTC日次上限・reset後初期化を本番同形で再現する', async () => {
    const acquire = (runToken: string) =>
      fetch(`${API_URL}/ai-diagnoses/202602/lease`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ runToken }),
      })

    expect((await acquire('run-1')).status).toBe(200)
    const released = await fetch(`${API_URL}/ai-diagnoses/202602/lease`, {
      method: 'DELETE',
      headers: jsonHeaders,
      body: JSON.stringify({ runToken: 'run-1' }),
    })
    expect(released.status).toBe(200)
    const cooldown = await acquire('run-2')
    expect(cooldown.status).toBe(429)
    expect(Number(cooldown.headers.get('Retry-After'))).toBeGreaterThan(0)

    initStore()
    const guard = getTable('ai_execution_guard')[0]
    Object.assign(guard, {
      usage_date: new Date().toISOString().slice(0, 10),
      daily_count: 20,
      last_started_at: '1970-01-01T00:00:00.000Z',
    })
    const daily = await acquire('run-3')
    expect(daily.status).toBe(429)

    initStore()
    expect((await acquire('run-4')).status).toBe(200)
  })

  it.each(invalidAiWireCases)('$nameを本番と同じ400で拒否する', async ({
    path,
    method,
    body,
    rawBody,
  }) => {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: method === 'GET' ? { authorization: AUTHORIZATION } : jsonHeaders,
      body: method === 'GET' ? undefined : (rawBody ?? JSON.stringify(body)),
    })

    expect(response.status).toBe(400)
  })

  it('後続assignmentが競合しても先行assignmentを部分更新しない', async () => {
    const lease = await fetch(`${API_URL}/ai-diagnoses/202602/lease`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ runToken: 'run-1' }),
    })
    expect(lease.status).toBe(200)
    const expense = getTable('expenses').find(({ month }) => month === '202602')
    const conflictingExpense = getTable('expenses').find(({ id }) => id !== expense?.id)
    const response = await fetch(`${API_URL}/ai-diagnoses/categories`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        month: '202602',
        runToken: 'run-1',
        assignments: [
          {
            expenseIds: [expense?.id],
            category: 'housing',
            expectedLabel: expense?.label,
          },
          {
            expenseIds: [conflictingExpense?.id],
            category: 'dining',
            expectedLabel: '更新後のラベル',
          },
        ],
      }),
    })

    expect(response.status).toBe(409)
    expect(expense).not.toHaveProperty('ai_category')
  })
})
