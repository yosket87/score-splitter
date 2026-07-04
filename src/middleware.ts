import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = 'household_session'
const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/

export function middleware(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME)
  const hasSession = isValidSessionCookieValue(session?.value)
  const isLoginPage = request.nextUrl.pathname === '/login'

  // ログインページにアクセスしようとしている場合
  if (isLoginPage) {
    // すでにログイン済みならトップページへ
    if (hasSession) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // 未ログインの場合はログインページへ
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

function isValidSessionCookieValue(value: string | undefined): boolean {
  // Edge middlewareはDBを引かない一次フィルタに留める。
  // 実際の失効・期限切れ判定はServer Actions側のrequireAuth/isAuthenticatedで行う。
  return value !== undefined && SESSION_TOKEN_PATTERN.test(value)
}

export const config = {
  matcher: [
    // ルートパスとその他のページパスに適用
    '/',
    '/login',
    '/((?!_next|favicon.ico|api).*)',
  ],
}
