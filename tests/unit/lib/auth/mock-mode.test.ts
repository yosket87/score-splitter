import { afterEach, expect, it, vi } from 'vitest'
import { isDevelopmentMockEnabled } from '@/lib/mock-mode'
afterEach(() => vi.unstubAllEnvs())
it.each([
  ['development', 'nodejs', 'true', true], ['production', 'nodejs', 'true', false],
  ['test', 'nodejs', 'true', false], ['development', 'edge', 'true', false],
  ['development', undefined, 'true', false], ['development', 'nodejs', 'false', false],
])('mock境界 %s/%s/%s => %s', (mode, runtime, enabled, expected) => {
  vi.stubEnv('NODE_ENV', mode); vi.stubEnv('NEXT_RUNTIME', runtime); vi.stubEnv('USE_MOCKS', enabled)
  expect(isDevelopmentMockEnabled()).toBe(expected)
})
