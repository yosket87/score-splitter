import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const backend = vi.hoisted(() => ({ getDatabase: vi.fn(), isWorkerApiMockEnabled: vi.fn(), runD1Operation: vi.fn() }))
const client = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('@/lib/api/backend', () => backend)
vi.mock('@/lib/api/client', async (original) => ({ ...await original<typeof import('@/lib/api/client')>(), ...client }))
import { getLegacyHouseholdContext, assertExistingLoginHousehold } from '@/lib/api/households'
const context = { householdId: 'A' }

beforeEach(() => {
  vi.resetAllMocks()
  backend.runD1Operation.mockImplementation((run: () => Promise<unknown>) => run())
})

describe('世帯APIアダプター', () => {
  it('通常環境はD1から既存世帯を解決し、既存世帯のみログインを許可する', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(false)
    backend.getDatabase.mockReturnValue({ prepare: () => ({ first: async () => ({ id: 'A' }) }) })
    expect(await getLegacyHouseholdContext()).toEqual(context)
    await expect(assertExistingLoginHousehold(context)).resolves.toBeUndefined()
    await expect(assertExistingLoginHousehold({ householdId: 'B' })).rejects.toThrow()
    expect(client.apiRequest).not.toHaveBeenCalled()
  })
  it('モック環境は内部control-planeで解決し、欠落や別世帯からfallbackしない', async () => {
    backend.isWorkerApiMockEnabled.mockReturnValue(true)
    client.apiRequest.mockResolvedValue({ data: context })
    const resolved = await getLegacyHouseholdContext()
    expect(resolved).toEqual(context)
    expect(Object.isFrozen(resolved)).toBe(true)
    await expect(assertExistingLoginHousehold(context)).resolves.toBeUndefined()
    await expect(assertExistingLoginHousehold({ householdId: 'B' })).rejects.toThrow()
    await expect(assertExistingLoginHousehold({ householdId: '' })).rejects.toThrow()
    expect(client.apiRequest).toHaveBeenCalledWith('/internal/auth/legacy-household', expect.objectContaining({ responseSchema: expect.any(Object) }))
    expect(backend.getDatabase).not.toHaveBeenCalled()
  })
})
