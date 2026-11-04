import { NextResponse } from 'next/server'
import { isFirebaseMockEnabled, isLocalMockRequest } from '@/lib/mock-mode'

export async function POST(request: Request) {
  if (!isFirebaseMockEnabled() || !isLocalMockRequest(request)) return new NextResponse(null, { status: 404 })
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('scenario' in body) ||
      (body.scenario !== 'member-a' && body.scenario !== 'pending-a' && body.scenario !== 'legacy-disabled')) return new NextResponse(null, { status: 400 })
    const { deleteRows, insertRows, updateRows, getTable } = await import('@/mocks/db')
    if (body.scenario === 'legacy-disabled') {
      const { MOCK_LEGACY_HOUSEHOLD_ID } = await import('@/mocks/auth-handlers')
      updateRows('households', { id: `eq.${MOCK_LEGACY_HOUSEHOLD_ID}` }, { legacy_auth_disabled_at: new Date().toISOString() })
      for (const session of [...getTable('sessions')]) {
        if (session.household_id === MOCK_LEGACY_HOUSEHOLD_ID && ['password', 'passkey'].includes(String(session.auth_method))) {
          deleteRows('sessions', { token: `eq.${session.token}` })
        }
      }
    }
    deleteRows('firebase_mock_config', {})
    insertRows('firebase_mock_config', [{ scenario: body.scenario }])
    return NextResponse.json({ ok: true })
  } catch { return new NextResponse(null, { status: 400 }) }
}
