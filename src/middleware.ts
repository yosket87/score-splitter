import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = 'household_session'
const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/

// apex はウェイトリストLP専用ホスト（wwwはCloudflareのRedirect Ruleでapexへ寄せるが、防御的に同扱いにする）
const LP_HOSTS = new Set(['yamawake.app', 'www.yamawake.app'])
const APP_HOST = 'app.yamawake.app'
const LP_PATH = '/lp'
const LP_CANONICAL_URL = 'https://yamawake.app/'

export function middleware(request: NextRequest) {
  const hostResponse = routeByHost(request)
  if (hostResponse) {
    return hostResponse
  }

  const session = request.cookies.get(SESSION_COOKIE_NAME)
  const hasSession = isValidSessionCookieValue(session?.value)
  const isLoginPage = request.nextUrl.pathname === '/login'

  // ログインページにアクセスしようとしている場合
  if (isLoginPage) {
    // middlewareではDBの実セッションを検証できないため、ログインページ側で判定する。
    // 古いCookieをここでログイン済み扱いすると /login と / のリダイレクトループになる。
    return NextResponse.next()
  }

  // 未ログインの場合はログインページへ
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

function routeByHost(request: NextRequest): NextResponse | null {
  const host = getRequestHost(request)
  const { pathname } = request.nextUrl

  // apex: LPサイトとして振る舞い、アプリ系パスは app サブドメインへ逃がす
  if (LP_HOSTS.has(host)) {
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = LP_PATH
      return NextResponse.rewrite(url)
    }
    if (pathname === LP_PATH) {
      // 正規URLは apex ルートに一本化（重複コンテンツ回避）
      return NextResponse.redirect(LP_CANONICAL_URL, 308)
    }
    // pathnameを文字列連結でURLに埋め込むと `//evil.com` がauthorityに化けて
    // オープンリダイレクトになるため、URLオブジェクトのホストだけ差し替える
    const appUrl = request.nextUrl.clone()
    appUrl.protocol = 'https:'
    appUrl.host = APP_HOST
    appUrl.port = ''
    return NextResponse.redirect(appUrl, 307)
  }

  // アプリホスト: LPの正規URLは apex のみ
  if (host === APP_HOST && pathname === LP_PATH) {
    return NextResponse.redirect(LP_CANONICAL_URL, 308)
  }

  // workers.dev / localhost / preview URL: /lp は公開LPのため認証なしで素通し
  if (pathname === LP_PATH) {
    return NextResponse.next()
  }

  return null
}

function getRequestHost(request: NextRequest): string {
  // hostヘッダを一次参照（x-forwarded-hostはクライアントが偽装できるため見ない）。
  // テスト等でヘッダが無い場合はURL由来のホストへフォールバック。
  const raw = request.headers.get('host') ?? request.nextUrl.host
  return raw.split(':')[0].toLowerCase()
}

function isValidSessionCookieValue(value: string | undefined): boolean {
  // Edge middlewareはDBを引かない一次フィルタに留める。
  // 実際の失効・期限切れ判定はServer Actions側のrequireAuth/isAuthenticatedで行う。
  return value !== undefined && SESSION_TOKEN_PATTERN.test(value)
}

export const config = {
  matcher: [
    // ルートパスとその他のページパスに適用。
    // /lp 本体はホスト別の正規URL制御（redirect）のため対象に含め、/lp/ 配下（静的アセット）は除外する
    '/',
    '/login',
    '/lp',
    '/((?!_next|favicon.ico|api|lp/).*)',
  ],
}
