import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.USE_MOCKS !== 'true') {
    return NextResponse.json(
      { error: 'エンドポイントが見つかりません' },
      { status: 404 }
    )
  }

  const { getAiDiagnosisMockStats } = await import('@/mocks/ai-diagnosis-stats')
  return NextResponse.json(getAiDiagnosisMockStats())
}
