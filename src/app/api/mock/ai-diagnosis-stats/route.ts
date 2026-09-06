import { isLocalMockRequest } from '@/lib/mock-mode'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  if (!isLocalMockRequest(request)) {
    return NextResponse.json(
      { error: 'エンドポイントが見つかりません' },
      { status: 404 }
    )
  }

  const { getAiDiagnosisMockStats } = await import('@/mocks/ai-diagnosis-stats')
  return NextResponse.json(getAiDiagnosisMockStats())
}
