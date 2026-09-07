import { NextRequest, NextResponse } from 'next/server'
import { isLocalMockRequest } from '@/lib/mock-mode'
import { authCookieOptions, privateResponse } from '@/lib/auth/google-cookies'
export async function POST(request: NextRequest) {
  if (!isLocalMockRequest(request)) return new NextResponse(null, { status: 404 })
  try {
    const { googlePreparations } = await import('@/mocks/google-provider')
    const input = await request.json()
    if (!googlePreparations.includes(input.scenario)) return new NextResponse(null, { status: 400 })
    const { prepareGoogleScenario } = await import('@/mocks/google-auth')
    const scenario = prepareGoogleScenario(input.scenario)
    const response = privateResponse(NextResponse.json({ success: true }))
    response.cookies.set('google_mock_scenario', scenario, authCookieOptions(3600))
    return response
  } catch { return new NextResponse(null, { status: 400 }) }
}
