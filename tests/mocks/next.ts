import { vi } from 'vitest'

// next/cache のモック
export const mockRevalidatePath = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

// next/headers のモック
export const mockCookies = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn(() => []),
}

export const mockHeaders = {
  get: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookies),
  headers: vi.fn(async () => mockHeaders),
}))

// next/navigation のモック
export const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// モックのリセット関数
export function resetNextMocks() {
  mockRevalidatePath.mockClear()
  mockCookies.get.mockClear()
  mockCookies.set.mockClear()
  mockCookies.delete.mockClear()
  mockCookies.getAll.mockClear()
  mockHeaders.get.mockClear()
  mockRedirect.mockClear()
}
