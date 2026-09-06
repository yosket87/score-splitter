import { isLocalMockRequest } from '@/lib/mock-mode'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  if (!isLocalMockRequest(request)) {
    return NextResponse.json(
      { error: 'エンドポイントが見つかりません' },
      { status: 404 }
    )
  }

  const { initStore } = await import('@/mocks/db')
  const { resetAiDiagnosisMockStats } = await import('@/mocks/ai-diagnosis-stats')
  initStore()
  resetAiDiagnosisMockStats()

  return NextResponse.json({ success: true })
}
