import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleRequest } from '../../../cloudflare/worker/src/index'
import { createRecordsSqlite } from '../../helpers/records-sqlite'
import { server } from '@/mocks/server'
import { getTable, initStore } from '@/mocks/db'
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64)
const base = 'http://mock-worker.local'
const headers = (token: string) => ({ authorization: 'Bearer mock-worker-token', 'x-household-session': token, 'content-type': 'application/json' })
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
describe.each(['Worker', 'MSW'])('%s の明細HTTP世帯境界', backend => {
  it('全collection・個別mutation・コピーでDB sessionだけを所属に使う', async () => {
    const fixture = createRecordsSqlite()
    initStore()
    getTable('households').push({ id: 'A' }, { id: 'B' })
    for (const [token, household] of [[tokenA, 'A'], [tokenB, 'B']]) {
      fixture.sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run(token, null, 'password', '2099-01-01', '2026-01-01', household)
      getTable('sessions').push({ token, person: null, auth_method: 'password', expires_at: '2099-01-01', household_id: household })
    }
    const request = async (path: string, method = 'GET', body?: unknown, token = tokenA) => {
      const init = { method, headers: headers(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }
      return backend === 'MSW' ? fetch(base + path, init) : handleRequest(new Request(base + path, init), { DB: fixture.db, WORKER_API_TOKEN: 'mock-worker-token' })
    }
    try {
      for (const table of ['incomes', 'expenses', 'carryovers']) {
        const input = { month: '202608', label: '同名', amount: table === 'incomes' ? 100 : -100, person: 'husband', householdId: 'B' }
        const own = await (await request('/' + table, 'POST', input)).json()
        const foreign = await (await request('/' + table, 'POST', input, tokenB)).json()
        const list = await request('/' + table + '?month=202608&householdId=B')
        expect((await list.json()).data.map((row: {
          id: string
        }) => row.id)).toEqual([own.data.id])
        for (const id of [foreign.data.id, 'missing']) {
          const response = await request('/' + table + '/' + id, 'PATCH', input)
          expect(response.status).toBe(404)
          expect((await request('/' + table + '/' + id, 'DELETE')).status).toBe(404)
          if (table !== 'incomes')
            expect((await request('/' + table + '/' + id + '/' + (table === 'expenses' ? 'carryover' : 'cleared'), 'PATCH', { isCarryover: true, isCleared: true })).status).toBe(404)
        }
        expect((await request('/' + table + '?month=202608', 'GET', undefined, '')).status).toBe(401)
      }
      expect((await (await request('/monthly-amounts')).json()).data).toEqual({ incomes: [{ month: '202608', amount: 100 }], expenses: [{ month: '202608', amount: -100 }] })
      const preview = (await (await request('/copy-month/preview?sourceMonth=202608&targetMonth=202609')).json()).data
      const input = { sourceMonth: '202608', targetMonth: '202609', mode: 'replace', includeCarryover: true, carryoverFingerprint: preview.carryoverFingerprint, selectedItems: preview.items.map((item: object) => ({ ...item, itemCopyMode: 'withAmount' })), householdId: 'B' }
      expect((await request('/copy-month', 'POST', input)).status).toBe(200)
      expect((await (await request('/incomes?month=202609', 'GET', undefined, tokenB)).json()).data).toEqual([])
      input.selectedItems[0].label = '改ざん'
      expect((await request('/copy-month', 'POST', input)).status).toBe(409)
      expect((await request('/copy-month', 'POST', input, '')).status).toBe(401)
      expect((await request('/monthly-amounts', 'GET', undefined, '')).status).toBe(401)
    }
    finally {
      fixture.sqlite.close()
    }
  })
})
