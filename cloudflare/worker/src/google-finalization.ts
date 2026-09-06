import { z } from 'zod'
import type { D1DatabaseLike, Runtime } from './d1'
import { authOperation, GoogleAuthError, opaque } from './google-auth-shared'

const memberSchema = z.object({
  legacySlot: z.enum(['existing-member-1', 'existing-member-2']), userId: opaque,
  identityId: opaque, membershipId: opaque, sessionEpoch: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  reloginRef: opaque, dataCheckRef: opaque,
})
const finalizationSchema = z.object({ householdId: opaque, confirmedBy: opaque, members: z.array(memberSchema).length(2) })
  .refine(input => new Set(input.members.map(member => member.legacySlot)).size === 2
    && new Set(input.members.map(member => member.userId)).size === 2
    && new Set(input.members.map(member => member.reloginRef)).size === 2
    && new Set(input.members.map(member => member.dataCheckRef)).size === 2)
export type LegacyFinalization = z.infer<typeof finalizationSchema>

// 読取と最終UPDATEは同じ述語を使う。確認後の失効/所属追加/主体差替えもここで拒否する。
const memberCondition = `EXISTS(SELECT 1 FROM google_migration_requests r
  JOIN users u ON u.id=r.consumed_user_id AND u.active=1 AND u.session_epoch=?
  JOIN google_identities i ON i.user_id=u.id AND i.id=? AND i.issuer='https://accounts.google.com' AND i.revoked_at IS NULL
  JOIN household_memberships m ON m.user_id=u.id AND m.id=? AND m.household_id=households.id AND m.revoked_at IS NULL
  WHERE r.purpose='legacy_enrollment' AND r.status='consumed' AND r.approved_household_id=households.id
    AND r.legacy_slot=? AND r.consumed_user_id=?
    AND (SELECT COUNT(*) FROM household_memberships active WHERE active.user_id=u.id AND active.revoked_at IS NULL)=1)`
const memberBindings = (input: LegacyFinalization) => input.members.flatMap(member =>
  [member.sessionEpoch, member.identityId, member.membershipId, member.legacySlot, member.userId])
async function readReview(db: D1DatabaseLike, input: LegacyFinalization) {
  const stopped = await db.prepare("SELECT legacy_auth_disabled_at AS disabledAt FROM households WHERE id=? AND legacy_auth_key='legacy' AND legacy_auth_disabled_at IS NOT NULL")
    .bind(input.householdId).first<{ disabledAt: string }>()
  if (stopped) return { ...input, disabledAt: stopped.disabledAt }
  const household = await db.prepare(`SELECT id,legacy_auth_disabled_at AS disabledAt FROM households
    WHERE id=? AND legacy_auth_key='legacy' AND ${memberCondition} AND ${memberCondition}`)
    .bind(input.householdId, ...memberBindings(input)).first<{ id: string; disabledAt: string | null }>()
  if (!household) throw new GoogleAuthError('approval_invalid')
  return { ...input, disabledAt: household.disabledAt }
}
export function reviewLegacyFinalization(db: D1DatabaseLike, input: unknown) {
  return authOperation(() => readReview(db, finalizationSchema.parse(input)))
}
export function finalizeLegacyAuthentication(db: D1DatabaseLike, runtime: Runtime, value: unknown) {
  return authOperation(async () => {
    const input = finalizationSchema.parse(value)
    const review = await readReview(db, input)
    if (review.disabledAt) return { kind: 'already_finalized' as const, householdId: input.householdId, disabledAt: review.disabledAt }
    // 旧session削除は0013のAFTER triggerが同じUPDATE内で行う。
    const result = await db.prepare(`UPDATE households SET legacy_auth_disabled_at=?
      WHERE id=? AND legacy_auth_key='legacy' AND legacy_auth_disabled_at IS NULL
      AND ${memberCondition} AND ${memberCondition} RETURNING legacy_auth_disabled_at AS disabledAt`)
      .bind(runtime.now().toISOString(), input.householdId, ...memberBindings(input)).first<{ disabledAt: string }>()
    if (!result) throw new GoogleAuthError('approval_invalid')
    return { kind: 'finalized' as const, householdId: input.householdId, disabledAt: result.disabledAt }
  })
}
