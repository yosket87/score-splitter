import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as reset } from '@/app/api/mock/reset/route'
import { GET as stats } from '@/app/api/mock/ai-diagnosis-stats/route'
import { POST as prepare } from '@/app/api/mock/google/prepare/route'
import { GET as authorize } from '@/app/api/mock/google/authorize/route'
beforeEach(() => { vi.stubEnv('USE_MOCKS', 'true'); vi.stubEnv('NEXT_RUNTIME', 'nodejs'); vi.stubEnv('NODE_ENV', 'production') })
afterEach(() => vi.unstubAllEnvs())
it('productionでは既存と新規のmock入口を全て404にする', async () => {
  const request = new NextRequest('http://localhost:3000/api/mock/fixture')
  for (const handler of [reset, stats, prepare, authorize]) expect((await handler(request)).status).toBe(404)
})
it('developmentでも他originやcross-origin書込は受け付けない', async () => {
  vi.stubEnv('NODE_ENV', 'development')
  expect((await prepare(new NextRequest('http://preview.local/api/mock/google/prepare', { method: 'POST' }))).status).toBe(404)
  expect((await prepare(new NextRequest('http://localhost:3000/api/mock/google/prepare', { method: 'POST', headers: { origin: 'https://attacker.example' } }))).status).toBe(404)
})
