import { NextRequest, NextResponse } from 'next/server'
import { isLocalMockRequest } from '@/lib/mock-mode'
import { privateResponse } from '@/lib/auth/google-cookies'
export async function GET(request: NextRequest) {
  if (!isLocalMockRequest(request)) return new NextResponse(null, { status: 404 })
  try {
    const { authorizeGoogleMock } = await import('@/mocks/google-provider')
    return privateResponse(NextResponse.redirect(authorizeGoogleMock(request.nextUrl.searchParams.get('request') ?? ''), 303))
  } catch { return privateResponse(NextResponse.redirect(new URL('/login?google=error', request.url), 303)) }
}
