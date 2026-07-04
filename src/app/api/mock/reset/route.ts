import { NextResponse } from 'next/server'

export async function POST() {
  if (process.env.USE_MOCKS !== 'true') {
    return NextResponse.json(
      { error: 'エンドポイントが見つかりません' },
      { status: 404 }
    )
  }

  const { initStore } = await import('@/mocks/db')
  initStore()

  return NextResponse.json({ success: true })
}
