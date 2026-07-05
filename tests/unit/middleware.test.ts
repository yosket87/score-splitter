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

function createHostRequest(host: string, path: string, sessionValue?: string) {
  const headers: Record<string, string> = { host }
  if (sessionValue) {
    headers.cookie = `household_session=${sessionValue}`
  }
  return new NextRequest(`https://${host}${path}`, { headers })
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

  it('有効な形式のセッションCookieでもログインページは通す', () => {
    const response = middleware(createRequest('/login', VALID_SESSION_TOKEN))

    expect(response.headers.get('location')).toBeNull()
  })
})

describe('middleware ホストベースルーティング', () => {
  describe('apex (yamawake.app) はLPサイトとして振る舞う', () => {
    it('/ はLPへrewriteする', () => {
      const response = middleware(createHostRequest('yamawake.app', '/'))

      expect(response.headers.get('x-middleware-rewrite')).toContain('/lp')
      expect(response.headers.get('location')).toBeNull()
    })

    it('/lp は正規URLの / へ308でredirectする', () => {
      const response = middleware(createHostRequest('yamawake.app', '/lp'))

      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toBe('https://yamawake.app/')
    })

    it('アプリ系パスは app.yamawake.app へ307でredirectする', () => {
      const response = middleware(createHostRequest('yamawake.app', '/login'))

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://app.yamawake.app/login')
    })

    it('セッションCookieがあってもアプリ系パスは app.yamawake.app へredirectする', () => {
      const response = middleware(
        createHostRequest('yamawake.app', '/2026/02', VALID_SESSION_TOKEN)
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://app.yamawake.app/2026/02')
    })

    it('redirect時にクエリ文字列を保持する', () => {
      const response = middleware(createHostRequest('yamawake.app', '/2026/02?tab=expense'))

      expect(response.headers.get('location')).toBe(
        'https://app.yamawake.app/2026/02?tab=expense'
      )
    })

    it('www.yamawake.app もLPサイトとして扱う', () => {
      const response = middleware(createHostRequest('www.yamawake.app', '/'))

      expect(response.headers.get('x-middleware-rewrite')).toContain('/lp')
    })

    it('hostヘッダが無くてもURLのホストで判定する', () => {
      const response = middleware(new NextRequest('https://yamawake.app/'))

      expect(response.headers.get('x-middleware-rewrite')).toContain('/lp')
    })
  })

  describe('app.yamawake.app はアプリとして振る舞う', () => {
    it('/lp はapexへ308でredirectする', () => {
      const response = middleware(createHostRequest('app.yamawake.app', '/lp'))

      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toBe('https://yamawake.app/')
    })

    it('セッションCookieなしの / はログインへredirectする', () => {
      const response = middleware(createHostRequest('app.yamawake.app', '/'))

      expect(response.headers.get('location')).toBe('https://app.yamawake.app/login')
    })

    it('有効な形式のセッションCookieがあれば保護ページを通す', () => {
      const response = middleware(
        createHostRequest('app.yamawake.app', '/2026/02', VALID_SESSION_TOKEN)
      )

      expect(response.headers.get('location')).toBeNull()
    })
  })

  describe('その他のホスト（workers.dev / localhost）は従来挙動', () => {
    it('workers.dev の /lp は認証なしで素通しする', () => {
      const response = middleware(
        createHostRequest('score-splitter-web.yosket87.workers.dev', '/lp')
      )

      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    })

    it('localhost の /lp は認証なしで素通しする', () => {
      const response = middleware(new NextRequest('http://localhost:3000/lp'))

      expect(response.headers.get('location')).toBeNull()
    })
  })
})
