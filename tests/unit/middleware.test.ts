import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const VALID_SESSION_TOKEN = 'a'.repeat(64)

function createRequest(path: string, sessionValue?: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: sessionValue
      ? {
          cookie: `household_session=${sessionValue}`,
        }
      : undefined,
  })
}

describe('middleware', () => {
  it('有効な形式のセッションCookieがあれば保護ページを通す', () => {
    const response = middleware(createRequest('/2026/02', VALID_SESSION_TOKEN))

    expect(response.headers.get('location')).toBeNull()
  })

  it('不正な形式のセッションCookieでは保護ページからログインへ戻す', () => {
    const response = middleware(createRequest('/2026/02', 'expired-token'))

    expect(response.headers.get('location')).toBe('http://localhost/login')
  })

  it('不正な形式のセッションCookieではログインページからトップへ飛ばさない', () => {
    const response = middleware(createRequest('/login', 'expired-token'))

    expect(response.headers.get('location')).toBeNull()
  })
})
