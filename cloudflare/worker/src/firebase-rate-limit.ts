import type { D1DatabaseLike, Runtime } from './d1'
import { FirebaseAuthError } from './firebase-shared'

// Firebaseの外部検証より前に予約する。単一UPSERTで並行要求の取りこぼしを防ぐ。
export async function reserveFirebaseExchange(db: D1DatabaseLike, runtime: Runtime, key: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new FirebaseAuthError()
  const now = runtime.now().toISOString()
  const cutoff = new Date(runtime.now().getTime() - 15 * 60_000).toISOString()
  const row = await db.prepare(`INSERT INTO login_attempts(attempt_key,count,window_start,updated_at) VALUES(?,1,?,?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      count=CASE WHEN julianday(login_attempts.window_start)<=julianday(?) THEN 1 ELSE MIN(login_attempts.count+1,31) END,
      window_start=CASE WHEN julianday(login_attempts.window_start)<=julianday(?) THEN excluded.window_start ELSE login_attempts.window_start END,
      updated_at=excluded.updated_at RETURNING count`).bind(key, now, now, cutoff, cutoff).first<{ count: number }>()
  return !!row && row.count <= 30
}
