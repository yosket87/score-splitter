import type { D1DatabaseLike } from './d1'
import { HttpError } from './http'

export type HouseholdContext = Readonly<{ householdId: string }>

export function assertHouseholdContext(value: unknown): asserts value is HouseholdContext {
  if (typeof value !== 'object' || value === null || !('householdId' in value) ||
    typeof value.householdId !== 'string' || value.householdId.trim() === '') {
    throw new HttpError('世帯コンテキストが必要です', 401)
  }
}

export async function getLegacyHouseholdContext(db: D1DatabaseLike): Promise<HouseholdContext> {
  const row = await db.prepare("SELECT id FROM households WHERE legacy_auth_key = 'legacy'")
    .first<{ id: string }>()
  if (!row) throw new HttpError('ログイン可能な世帯が見つかりません', 401)
  const context = Object.freeze({ householdId: row.id })
  assertHouseholdContext(context)
  return context
}

// 新規世帯ログインは後続段階で解禁する。既存B sessionの検証には適用しない。
export async function assertExistingLoginHousehold(db: D1DatabaseLike, context: HouseholdContext) {
  assertHouseholdContext(context)
  const legacy = await getLegacyHouseholdContext(db)
  if (legacy.householdId !== context.householdId) throw new HttpError('この世帯ではログインできません', 401)
}
