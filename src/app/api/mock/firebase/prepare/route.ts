import { NextResponse } from 'next/server'
import { isFirebaseMockEnabled, isLocalMockRequest } from '@/lib/mock-mode'

export async function POST(request: Request) {
  if (!isFirebaseMockEnabled() || !isLocalMockRequest(request)) return new NextResponse(null, { status: 404 })
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('scenario' in body) ||
      (body.scenario !== 'member-a' && body.scenario !== 'pending-a')) return new NextResponse(null, { status: 400 })
    const { deleteRows, insertRows } = await import('@/mocks/db')
    deleteRows('firebase_mock_config', {})
    insertRows('firebase_mock_config', [{ scenario: body.scenario }])
    return NextResponse.json({ ok: true })
  } catch { return new NextResponse(null, { status: 400 }) }
}
