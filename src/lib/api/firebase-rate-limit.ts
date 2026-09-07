import 'server-only'
import { createHash } from 'node:crypto'
import { reserveFirebaseExchange } from '../../../cloudflare/worker/src/firebase-rate-limit'
import { getDatabase, getRuntime } from './backend'
import { isFirebaseMockEnabled } from '@/lib/mock-mode'

export async function allowFirebaseExchange(headers: Pick<Headers, 'get'>): Promise<boolean> {
  // CFが上書きする接続元だけ使用する。任意のX-Forwarded-Forで制限を回避させない。
  const key = createHash('sha256').update(`firebase-exchange:${headers.get('cf-connecting-ip') ?? 'local'}`).digest('hex')
  if (isFirebaseMockEnabled()) {
    const { getTable, insertRows, updateRows } = await import('@/mocks/db')
    const previous = getTable('firebase_mock_limits').find(row => row.id === key)
    if (!previous || Number(previous.started) <= Date.now() - 15 * 60_000) {
      if (previous) updateRows('firebase_mock_limits', { id: `eq.${key}` }, { count: 1, started: Date.now() })
      else insertRows('firebase_mock_limits', [{ id: key, count: 1, started: Date.now() }])
      return true
    }
    updateRows('firebase_mock_limits', { id: `eq.${key}` }, { count: Number(previous.count) + 1 })
    return Number(previous.count) < 30
  }
  return reserveFirebaseExchange(getDatabase(), getRuntime(), key)
}
