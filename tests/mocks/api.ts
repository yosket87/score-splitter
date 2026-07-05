import { vi } from 'vitest'

const recordsApiMock = vi.hoisted(() => ({
  getIncomesByMonth: vi.fn(),
  createIncome: vi.fn(),
  updateIncome: vi.fn(),
  deleteIncome: vi.fn(),
  getExpensesByMonth: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  toggleExpenseCarryover: vi.fn(),
  deleteExpense: vi.fn(),
  getCarryoversByMonth: vi.fn(),
  createCarryover: vi.fn(),
  updateCarryover: vi.fn(),
  toggleCarryoverCleared: vi.fn(),
  deleteCarryover: vi.fn(),
}))

const monthlySummaryApiMock = vi.hoisted(() => ({
  getMonthlyAmounts: vi.fn(),
}))

const copyMonthApiMock = vi.hoisted(() => ({
  getCopyMonthPreview: vi.fn(),
  copyMonthData: vi.fn(),
}))

const sessionsApiMock = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}))

const passkeysApiMock = vi.hoisted(() => ({
  listPasskeys: vi.fn(),
  getPasskey: vi.fn(),
  createPasskey: vi.fn(),
  updatePasskeyCounter: vi.fn(),
  deletePasskey: vi.fn(),
  createChallenge: vi.fn(),
  getLatestChallenge: vi.fn(),
  deleteChallenges: vi.fn(),
  deleteExpiredChallenges: vi.fn(),
}))

const waitlistApiMock = vi.hoisted(() => ({
  registerWaitlist: vi.fn(),
}))

vi.mock('@/lib/api/records', () => recordsApiMock)
vi.mock('@/lib/api/monthly-summary', () => monthlySummaryApiMock)
vi.mock('@/lib/api/copy-month', () => copyMonthApiMock)
vi.mock('@/lib/api/sessions', () => sessionsApiMock)
vi.mock('@/lib/api/passkeys', () => passkeysApiMock)
vi.mock('@/lib/api/waitlist', () => waitlistApiMock)

export const mockRecordsApi = recordsApiMock
export const mockMonthlySummaryApi = monthlySummaryApiMock
export const mockCopyMonthApi = copyMonthApiMock
export const mockSessionsApi = sessionsApiMock
export const mockPasskeysApi = passkeysApiMock
export const mockWaitlistApi = waitlistApiMock

export function clearApiMocks() {
  for (const group of [
    mockRecordsApi,
    mockMonthlySummaryApi,
    mockCopyMonthApi,
    mockSessionsApi,
    mockPasskeysApi,
    mockWaitlistApi,
  ]) {
    for (const mock of Object.values(group)) {
      mock.mockReset()
    }
  }
}
