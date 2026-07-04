import type { D1DatabaseLike, Runtime } from './d1'
import { assertObject, parseString } from './validation'

const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_ATTEMPT_LIMIT = 10

interface LoginAttemptRow {
  attempt_key: string
  count: number
  window_start: string
  updated_at: string
}

export interface LoginRateLimitStatus {
  allowed: boolean
  retryAfterSeconds?: number
}

export async function checkLoginRateLimit(
  db: D1DatabaseLike,
  runtime: Runtime,
  body: unknown
): Promise<LoginRateLimitStatus> {
  const key = parseLoginAttemptKey(body)
  const row = await getLoginAttempt(db, key)
  return getStatus(row, runtime.now())
}

export async function recordFailedLoginAttempt(
  db: D1DatabaseLike,
  runtime: Runtime,
  body: unknown
): Promise<LoginRateLimitStatus> {
  const key = parseLoginAttemptKey(body)
  const now = runtime.now()
  const row = await getLoginAttempt(db, key)
  const nowIso = now.toISOString()

  if (!row) {
    const nextRow = {
      attempt_key: key,
      count: 1,
      window_start: nowIso,
      updated_at: nowIso,
    }
    await db
      .prepare(
        'INSERT INTO login_attempts (attempt_key, count, window_start, updated_at) VALUES (?, ?, ?, ?)'
      )
      .bind(nextRow.attempt_key, nextRow.count, nextRow.window_start, nextRow.updated_at)
      .run()
    return getStatus(nextRow, now)
  }

  const nextRow = {
    ...row,
    count: isWindowExpired(row, now) ? 1 : row.count + 1,
    window_start: isWindowExpired(row, now) ? nowIso : row.window_start,
    updated_at: nowIso,
  }
  await db
    .prepare(
      'UPDATE login_attempts SET count = ?, window_start = ?, updated_at = ? WHERE attempt_key = ?'
    )
    .bind(nextRow.count, nextRow.window_start, nextRow.updated_at, nextRow.attempt_key)
    .run()
  return getStatus(nextRow, now)
}

export async function resetLoginAttempts(
  db: D1DatabaseLike,
  body: unknown
): Promise<void> {
  const key = parseLoginAttemptKey(body)
  await db.prepare('DELETE FROM login_attempts WHERE attempt_key = ?').bind(key).run()
}

async function getLoginAttempt(
  db: D1DatabaseLike,
  key: string
): Promise<LoginAttemptRow | null> {
  return db
    .prepare(
      'SELECT attempt_key, count, window_start, updated_at FROM login_attempts WHERE attempt_key = ?'
    )
    .bind(key)
    .first<LoginAttemptRow>()
}

function getStatus(
  row: LoginAttemptRow | null,
  now: Date
): LoginRateLimitStatus {
  if (!row || isWindowExpired(row, now)) {
    return { allowed: true }
  }

  if (row.count < LOGIN_ATTEMPT_LIMIT) {
    return { allowed: true }
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((getWindowEnd(row).getTime() - now.getTime()) / 1000)
    ),
  }
}

function isWindowExpired(row: LoginAttemptRow, now: Date): boolean {
  return getWindowEnd(row).getTime() <= now.getTime()
}

function getWindowEnd(row: LoginAttemptRow): Date {
  return new Date(Date.parse(row.window_start) + LOGIN_ATTEMPT_WINDOW_MS)
}

function parseLoginAttemptKey(body: unknown): string {
  const input = assertObject(body)
  return parseString(input.key, 'key')
}
