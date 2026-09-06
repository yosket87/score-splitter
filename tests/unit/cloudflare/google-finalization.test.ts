import { webcrypto } from 'node:crypto'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createIdentitySqlite } from '../../helpers/identity-sqlite'
import { finalizationFixture, finalizationHousehold } from '../../helpers/google-finalization'
import { createRuntime, type D1DatabaseLike } from '../../../cloudflare/worker/src/d1'
import { finalizeLegacyAuthentication, reviewLegacyFinalization } from '../../../cloudflare/worker/src/google-finalization'
import { createSession, getSession } from '../../../cloudflare/worker/src/sessions'
let store: ReturnType<typeof createIdentitySqlite>
const runtime = createRuntime()
beforeEach(() => { store = createIdentitySqlite({ fixture: false }); vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { store.sqlite.close(); vi.unstubAllGlobals() })
it('2名の独立再ログインとデータ確認が不足したら停止しない', async () => {
  const { input } = await finalizationFixture(store.db, runtime)
  for (const bad of [{ ...input, members: input.members.slice(0, 1) }, { ...input, members: [input.members[0], input.members[0]] },
    { ...input, members: input.members.map(m => ({ ...m, reloginRef: '' })) }, { ...input, members: input.members.map(m => ({ ...m, dataCheckRef: '' })) }]) {
    await expect(finalizeLegacyAuthentication(store.db, runtime, bad)).rejects.toThrow()
  }
  expect(store.sqlite.prepare('SELECT legacy_auth_disabled_at FROM households WHERE id=?').get(finalizationHousehold)?.legacy_auth_disabled_at).toBeNull()
})
it('単一停止UPDATEで旧sessionだけを消しGoogleと旧資格情報/履歴を保持する', async () => {
  const { input, sessions } = await finalizationFixture(store.db, runtime)
  const legacy = { token: 'a'.repeat(64), person: null, authMethod: 'password', expiresAt: '2099-01-01T00:00:00.000Z' }
  await createSession(store.db, runtime, { householdId: finalizationHousehold }, legacy)
  const review = await reviewLegacyFinalization(store.db, input)
  expect(review.members).toHaveLength(2)
  expect(store.sqlite.prepare('SELECT legacy_auth_disabled_at FROM households WHERE id=?').get(finalizationHousehold)?.legacy_auth_disabled_at).toBeNull()
  const result = await finalizeLegacyAuthentication(store.db, runtime, input)
  expect(result.kind).toBe('finalized')
  expect(await getSession(store.db, legacy.token)).toBeNull()
  for (const session of sessions) expect(await getSession(store.db, session.token)).toMatchObject({ authMethod: 'google', userId: session.userId })
  expect(await finalizeLegacyAuthentication(store.db, runtime, input)).toEqual({ ...result, kind: 'already_finalized' })
  expect(store.sqlite.prepare('SELECT legacy_auth_key FROM households WHERE id=?').get(finalizationHousehold)?.legacy_auth_key).toBe('legacy')
  await expect(createSession(store.db, runtime, { householdId: finalizationHousehold }, legacy)).rejects.toThrow()
})
it.each(['inactive', 'second-membership', 'revoked-identity', 'zero-update'])('review後の%sを最終UPDATE内で拒否する', async change => {
  const { input } = await finalizationFixture(store.db, runtime)
  let changed = false
  const racingDb: D1DatabaseLike = { ...store.db, batch: store.db.batch.bind(store.db), prepare: sql => {
    if (sql.startsWith('UPDATE households') && !changed) {
      changed = true
      const user = input.members[0].userId
      if (change === 'inactive') store.sqlite.prepare('UPDATE users SET active=0,session_epoch=session_epoch+1,oauth_attempt_floor=(SELECT MAX(sequence) FROM oauth_login_attempts) WHERE id=?').run(user)
      if (change === 'second-membership') {
        store.sqlite.prepare("INSERT INTO households(id,created_at) VALUES('other','2026-01-01')").run()
        store.sqlite.prepare("INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES('extra',?,'other','husband','2026-01-01')").run(user)
        expect(store.sqlite.prepare('SELECT COUNT(*) n FROM household_memberships WHERE user_id=? AND revoked_at IS NULL').get(user)?.n).toBe(2)
      }
      if (change === 'revoked-identity') store.sqlite.prepare("UPDATE google_identities SET revoked_at='2026-09-06' WHERE id=?").run(input.members[0].identityId)
      if (change === 'zero-update') store.sqlite.exec("CREATE TRIGGER ignore_finalize BEFORE UPDATE OF legacy_auth_disabled_at ON households BEGIN SELECT RAISE(IGNORE); END;")
    }
    return store.db.prepare(sql)
  } }
  await expect(finalizeLegacyAuthentication(racingDb, runtime, input)).rejects.toThrow()
  expect(changed).toBe(true)
  expect(store.sqlite.prepare('SELECT legacy_auth_disabled_at FROM households WHERE id=?').get(finalizationHousehold)?.legacy_auth_disabled_at).toBeNull()
})

import { listPasskeys, getPasskey, deletePasskey, createPasskey, updatePasskeyCounter, findAuthenticationCredential } from '../../../cloudflare/worker/src/passkeys'
import { createChallenge, consumeChallenge } from '../../../cloudflare/worker/src/challenges'
it('停止後は有効Google利用者からでも旧パスキー全管理と未認証challengeを拒否する', async () => {
  const { input, sessions } = await finalizationFixture(store.db, runtime)
  const context = { householdId: finalizationHousehold }
  const credential = { id: 'credential', person: 'husband', publicKeyBase64: 'a2V5', counter: 0, transports: [] }
  await createPasskey(store.db, runtime, context, credential)
  const authentication = await createChallenge(store.db, runtime, { type: 'authentication' }, { challenge: 'old-auth', person: null, expiresAt: '2099-01-01' })
  const registration = await createChallenge(store.db, runtime, { type: 'registration', context }, { challenge: 'old-reg', person: 'husband', expiresAt: '2099-01-01' })
  await finalizeLegacyAuthentication(store.db, runtime, input)
  expect(await getSession(store.db, sessions[0].token)).not.toBeNull()
  for (const call of [() => listPasskeys(store.db, context), () => getPasskey(store.db, context, 'credential'),
    () => deletePasskey(store.db, context, 'credential'), () => createPasskey(store.db, runtime, context, { ...credential, id: 'new' }),
    () => updatePasskeyCounter(store.db, context, 'credential', { counter: 1 }),
    () => createChallenge(store.db, runtime, { type: 'authentication' }, { challenge: 'new-auth', person: null, expiresAt: '2099-01-01' }),
    () => consumeChallenge(store.db, runtime, { type: 'authentication' }, authentication.id, null),
    () => createChallenge(store.db, runtime, { type: 'registration', context }, { challenge: 'new-reg', person: 'husband', expiresAt: '2099-01-01' }),
    () => consumeChallenge(store.db, runtime, { type: 'registration', context }, registration.id, 'husband')]) await expect(call()).rejects.toThrow()
  expect(await findAuthenticationCredential(store.db, 'credential')).toBeNull()
  expect(store.sqlite.prepare('SELECT counter FROM passkey_credentials WHERE id=?').get('credential')?.counter).toBe(0)
})

it('停止済み世帯は後日のuser状態変化があっても停止日時を巻き戻さず報告する', async () => {
  const { input } = await finalizationFixture(store.db, runtime)
  const stopped = await finalizeLegacyAuthentication(store.db, runtime, input)
  store.sqlite.prepare('UPDATE users SET active=0,session_epoch=session_epoch+1,oauth_attempt_floor=(SELECT MAX(sequence) FROM oauth_login_attempts) WHERE id=?').run(input.members[0].userId)
  expect(await finalizeLegacyAuthentication(store.db, runtime, input)).toEqual({ ...stopped, kind: 'already_finalized' })
})
