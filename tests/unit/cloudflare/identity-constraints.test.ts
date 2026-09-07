import { readFileSync } from 'node:fs'
import type { SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createIdentitySqlite, identitySnapshot, legacyHouseholdId } from '../../helpers/identity-sqlite'

let state: ReturnType<typeof createIdentitySqlite>
beforeEach(() => {
  state = createIdentitySqlite()
  state.sqlite.exec(readFileSync('tests/fixtures/google-identity.sql', 'utf8'))
})
afterEach(() => state.sqlite.close())
const sql = (query: string) => state.sqlite.exec(query)
function newAttempt(id = 'new', subject = 'fixture-a', expiry = '2099-01-01') {
  const sequence = Number(state.sqlite.prepare(`INSERT INTO oauth_login_attempts(id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at)
    VALUES(?,printf('%064d',1),lower(hex(randomblob(32))),'nonce','verifier','2026-09-06',?) RETURNING sequence`).get(id, expiry)?.sequence)
  state.sqlite.prepare("UPDATE oauth_login_attempts SET status='processing',claim_id=?,claimed_at='2026-09-06' WHERE id=?").run(id, id)
  state.sqlite.prepare("UPDATE oauth_login_attempts SET status='completed',verified_issuer='https://accounts.google.com',verified_subject=?,nonce=NULL,code_verifier=NULL,completed_at='2026-09-06' WHERE id=?").run(subject, id)
  return sequence
}
function session(sequence: number, overrides: Record<string, SQLInputValue> = {}) {
  const values = { token: 'f'.repeat(64), household_id: legacyHouseholdId, person: 'husband', auth_method: 'google', created_at: '2026-09-06', expires_at: '2099-01-01', user_id: 'user-a', membership_id: 'member-a', session_epoch: 2, oauth_attempt_sequence: sequence, ...overrides }
  return state.sqlite.prepare(`INSERT INTO sessions(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values))
}
function request(id = 'grant-b', subject = 'fixture-b', purpose = 'legacy_enrollment') {
  state.sqlite.prepare(`INSERT INTO google_migration_requests(id,purpose,issuer,subject,code_hash,browser_binding_hash,created_at,expires_at)
    VALUES(?,?,'https://accounts.google.com',?,lower(hex(randomblob(32))),printf('%064d',2),'2026-09-06','2099-01-01')`).run(id, purpose, subject)
}
const approve = (slot = 'existing-member-2') => state.sqlite.prepare(`UPDATE google_migration_requests SET status='approved',approved_at='2026-09-06',approval_expires_at='2098-01-01',approved_by='operator',confirmation_ref='private-2',approved_household_id=?,approved_default_person='wife',legacy_slot=? WHERE id='grant-b'`).run(legacyHouseholdId, slot)

describe('主体・所属・失効のDB制約', () => {
  it('同じメールの別主体を保持し、旧主体の再割当と有効identity重複を拒否する', () => {
    expect(state.sqlite.prepare('SELECT COUNT(*) n FROM google_identities WHERE email=?').get('same@example.invalid')?.n).toBe(3)
    expect(() => sql("INSERT INTO google_identities(id,user_id,issuer,subject,created_at) VALUES('duplicate','user-b','https://accounts.google.com','fixture-old','2026-09-06')")).toThrow(/UNIQUE/)
    expect(() => sql("INSERT INTO google_identities(id,user_id,issuer,subject,created_at) VALUES('extra','user-a','https://accounts.google.com','extra','2026-09-06')")).toThrow(/UNIQUE/)
    for (const query of ["UPDATE google_identities SET revoked_at=NULL WHERE id='identity-old'", "UPDATE google_identities SET user_id='user-b' WHERE id='identity-a'", "DELETE FROM google_identities WHERE id='identity-old'"]) expect(() => sql(query)).toThrow()
  })
  it('有効なGoogle主体のsessionを発行し、同一試行で二重発行しない', () => {
    const seq = newAttempt()
    session(seq)
    expect(() => session(seq, { token: 'e'.repeat(64) })).toThrow(/UNIQUE/)
    expect(() => sql("UPDATE sessions SET session_epoch=3 WHERE token=printf('%064d',3)")).toThrow(/IMMUTABLE/)
  })
  it.each<Record<string, SQLInputValue>>([
    { user_id: null }, { membership_id: null }, { session_epoch: null }, { oauth_attempt_sequence: null },
    { user_id: 'user-b' }, { membership_id: 'member-b' }, { session_epoch: 1 }, { session_epoch: 3 },
    { household_id: 'unknown' }, { created_at: 'invalid' }, { expires_at: 'invalid' },
  ])('Google sessionの不整合を拒否する: %j', override => {
    expect(() => session(newAttempt(), override)).toThrow()
  })
  it('旧方式の4新列NULL互換を維持し、個人への推測紐付けを拒否する', () => {
    const seq = newAttempt()
    session(seq, { auth_method: 'password', person: null, user_id: null, membership_id: null, session_epoch: null, oauth_attempt_sequence: null })
    expect(() => session(seq, { token: 'e'.repeat(64), auth_method: 'password' })).toThrow()
  })
  it('解除はepochとfloorを原子的に増やし、再所属でも旧試行を再利用しない', () => {
    const seq = newAttempt()
    sql("UPDATE household_memberships SET revoked_at='2026-09-07' WHERE id='member-a'")
    expect(state.sqlite.prepare("SELECT session_epoch,oauth_attempt_floor FROM users WHERE id='user-a'").get()).toMatchObject({ session_epoch: 3, oauth_attempt_floor: seq })
    expect(state.sqlite.prepare("SELECT session_epoch FROM users WHERE id='user-b'").get()?.session_epoch).toBe(0)
    expect(() => sql("UPDATE household_memberships SET revoked_at=NULL WHERE id='member-a'")).toThrow(/IMMUTABLE/)
    sql(`INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES('member-new','user-a','${legacyHouseholdId}','wife','2026-09-07')`)
    expect(() => session(seq, { membership_id: 'member-new', session_epoch: 3 })).toThrow(/GOOGLE_SESSION_INVALID/)
    session(newAttempt('after-rejoin'), { membership_id: 'member-new', session_epoch: 3 })
  })
  it('停止・世代巻戻し・epoch上限時の所属解除を安全側で拒否する', () => {
    expect(() => sql("UPDATE users SET active=0 WHERE id='user-a'")).toThrow()
    expect(() => sql("UPDATE users SET session_epoch=1 WHERE id='user-a'")).toThrow()
    expect(() => sql("UPDATE users SET oauth_attempt_floor=0 WHERE id='user-a'")).toThrow()
    sql("UPDATE users SET active=0,session_epoch=3,oauth_attempt_floor=12 WHERE id='user-a'")
    expect(() => session(newAttempt(), { session_epoch: 3 })).toThrow(/GOOGLE_SESSION_INVALID/)
    sql("UPDATE users SET session_epoch=9007199254740991 WHERE id='user-b'")
    expect(() => sql("UPDATE household_memberships SET revoked_at='2026-09-07' WHERE id='member-b'")).toThrow()
    expect(state.sqlite.prepare("SELECT revoked_at FROM household_memberships WHERE id='member-b'").get()?.revoked_at).toBeNull()
  })
  it('未完了・別主体・期限切れのOAuth試行では発行しない', () => {
    expect(() => session(newAttempt('other', 'fixture-b'))).toThrow(/GOOGLE_SESSION_INVALID/)
    expect(() => session(newAttempt('expired', 'fixture-a', '2026-09-06T00:00:01Z'))).toThrow(/GOOGLE_SESSION_INVALID/)
    sql("INSERT INTO oauth_login_attempts(id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at) VALUES('pending',printf('%064d',1),printf('%064d',99),'n','v','2026-09-06','2099-01-01')")
    const seq = Number(state.sqlite.prepare("SELECT sequence FROM oauth_login_attempts WHERE id='pending'").get()?.sequence)
    expect(() => session(seq)).toThrow(/GOOGLE_SESSION_INVALID/)
  })
  it('不正日時をSQLのNULL評価で許容しない', () => {
    expect(() => sql("INSERT INTO oauth_login_attempts(id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at) VALUES('bad',printf('%064d',1),printf('%064d',99),'n','v','2026-09-06','invalid')")).toThrow()
    expect(() => sql("INSERT INTO google_migration_requests(id,purpose,issuer,subject,code_hash,browser_binding_hash,created_at,expires_at) VALUES('bad','legacy_enrollment','https://accounts.google.com','bad',printf('%064d',99),printf('%064d',1),'2026-09-06','invalid')")).toThrow()
  })
})

describe('一度きりの本人確認と原子性', () => {
  it('別ブラウザのpendingを許し、同じ主体の承認済み許可だけを一件に制限する', () => {
    request('grant-b', 'new-subject')
    request('other-browser', 'new-subject', 'identity_recovery')
    approve()
    const secondApproval = state.sqlite.prepare("UPDATE google_migration_requests SET status='approved',approved_at='2026-09-06',approval_expires_at='2098-01-01',approved_by='operator',confirmation_ref='private-1',target_user_id='user-a',expected_old_identity_id='identity-a',expected_session_epoch=2 WHERE id='other-browser'")
    expect(() => secondApproval.run()).toThrow(/UNIQUE/)
    sql("UPDATE google_migration_requests SET status='canceled' WHERE id='grant-b'")
    secondApproval.run()
  })
  it('会計担当者とは独立した2枠を消費後も保持する', () => {
    request()
    expect(() => approve('existing-member-1')).toThrow(/UNIQUE/)
    expect(() => approve('third-person')).toThrow(/CHECK/)
    approve()
    expect(() => sql("UPDATE google_migration_requests SET legacy_slot='existing-member-1' WHERE id='grant-b'")).toThrow()
    expect(() => sql("DELETE FROM google_migration_requests WHERE id='grant-a'")).toThrow(/HISTORY/)
    expect(() => sql("UPDATE google_migration_requests SET status='approved' WHERE id='grant-a'")).toThrow(/STATE/)
  })
  it('復旧の許可には同じ既存user・旧主体・現在epochが必要', () => {
    request('recovery', 'replacement', 'identity_recovery')
    const approval = state.sqlite.prepare("UPDATE google_migration_requests SET status='approved',approved_at='2026-09-06',approval_expires_at='2098-01-01',approved_by='operator',confirmation_ref='private-1',target_user_id='user-a',expected_old_identity_id=?,expected_session_epoch=? WHERE id='recovery'")
    expect(() => approval.run('identity-b', 2)).toThrow(/TARGET/)
    expect(() => approval.run('identity-a', 1)).toThrow(/TARGET/)
    approval.run('identity-a', 2)
  })
  it('本人確認の承認と同時に限りpendingを復旧へ分類でき、主体と承認内容は固定する', () => {
    request('recovery', 'replacement')
    expect(() => sql("UPDATE google_migration_requests SET purpose='identity_recovery' WHERE id='recovery'")).toThrow(/STATE/)
    sql("UPDATE google_migration_requests SET purpose='identity_recovery',status='approved',approved_at='2026-09-06',approval_expires_at='2098-01-01',approved_by='operator',confirmation_ref='private-1',target_user_id='user-a',expected_old_identity_id='identity-a',expected_session_epoch=2 WHERE id='recovery'")
    expect(state.sqlite.prepare("SELECT purpose,subject FROM google_migration_requests WHERE id='recovery'").get()).toMatchObject({ purpose: 'identity_recovery', subject: 'replacement' })
    expect(() => sql("UPDATE google_migration_requests SET subject='other' WHERE id='recovery'")).toThrow(/STATE/)
    expect(() => sql("UPDATE google_migration_requests SET purpose='legacy_enrollment' WHERE id='recovery'")).toThrow(/STATE/)
  })
  it('0件の許可消費が後続NOT NULL guardで失敗し、先行UPDATEも戻る', async () => {
    const before = identitySnapshot(state.sqlite)
    await expect(state.db.batch([
      state.db.prepare("UPDATE users SET updated_at='2026-09-08' WHERE id='user-a'"),
      state.db.prepare("UPDATE google_migration_requests SET status='consuming',consumption_id='loser' WHERE id='absent' AND status='approved'"),
      state.db.prepare("INSERT INTO users(id,created_at,updated_at) VALUES((SELECT 'new-user' FROM google_migration_requests WHERE consumption_id='loser'),'2026-09-06','2026-09-06')"),
    ])).rejects.toThrow(/NOT NULL/)
    expect(identitySnapshot(state.sqlite)).toEqual(before)
  })
  it('batchは任意RETURNINGを保持し、callbackを一度だけclaimする', async () => {
    sql("INSERT INTO oauth_login_attempts(id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at) VALUES('claim',printf('%064d',1),printf('%064d',99),'nonce','verifier','2026-09-06','2099-01-01')")
    const statement = state.db.prepare("UPDATE oauth_login_attempts SET status='processing',claim_id='only-once',claimed_at='2026-09-06' WHERE id='claim' AND status='pending' RETURNING sequence,nonce,code_verifier")
    const results = await state.db.batch([statement, statement])
    expect(results[0].results).toEqual([expect.objectContaining({ nonce: 'nonce', code_verifier: 'verifier' })])
    expect(results[1].meta?.changes).toBe(0)
    expect(results[1].results).toEqual([])
    expect(() => sql("UPDATE oauth_login_attempts SET status='pending',claim_id=NULL,claimed_at=NULL WHERE id='claim'")).toThrow(/STATE/)
  })
  it('独立した同時batchを入れ子transactionにせず確定する', async () => {
    const results = await Promise.allSettled(['one', 'two'].map(id => state.db.batch([
      state.db.prepare("UPDATE users SET updated_at='2026-09-08' WHERE id='user-a'"),
      state.db.prepare("INSERT INTO users(id,created_at,updated_at) VALUES(?,'2026-09-06','2026-09-06')").bind(id),
    ])))
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    expect(state.sqlite.prepare("SELECT COUNT(*) n FROM users WHERE id IN ('one','two')").get()?.n).toBe(2)
  })
})

describe('互換台帳と旧認証の将来停止guard', () => {
  it('Googleと旧台帳の履歴を保持し、UPDATE/DELETEを拒否する', () => {
    expect(state.sqlite.prepare("SELECT actor_user_id,actor_auth_method FROM payment_operations WHERE id='google-record'").get()).toMatchObject({ actor_user_id: 'user-a', actor_auth_method: 'google' })
    expect(state.sqlite.prepare("SELECT actor_user_id FROM payment_operations WHERE id='record'").get()?.actor_user_id).toBeNull()
    for (const table of ['payment_operations', 'payment_records', 'payment_voids']) {
      expect(() => sql(`UPDATE ${table} SET created_at='2099-01-01'`)).toThrow(/PAYMENT_IMMUTABLE/)
      expect(() => sql(`DELETE FROM ${table}`)).toThrow(/PAYMENT_IMMUTABLE/)
    }
  })
  it('停止日時を設定した時だけ旧sessionを消し、以後の発行と巻戻しを拒否する', () => {
    expect(state.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE auth_method IN ('password','passkey')").get()?.n).toBe(2)
    state.sqlite.prepare('UPDATE households SET legacy_auth_disabled_at=? WHERE id=?').run('2026-09-07', legacyHouseholdId)
    expect(state.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE auth_method IN ('password','passkey')").get()?.n).toBe(0)
    expect(state.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE auth_method='google'").get()?.n).toBe(2)
    expect(() => sql(`INSERT INTO sessions(token,auth_method,expires_at,created_at,household_id) VALUES(printf('%064d',7),'password','2099-01-01','2026-09-07','${legacyHouseholdId}')`)).toThrow(/LEGACY_AUTH_DISABLED/)
    expect(() => sql(`INSERT INTO passkey_credentials(id,person,public_key_base64,created_at,household_id) VALUES('new','wife','key','2026-09-07','${legacyHouseholdId}')`)).toThrow(/LEGACY_AUTH_DISABLED/)
    expect(() => sql(`INSERT INTO webauthn_challenges(id,challenge,type,person,created_at,expires_at,household_id) VALUES('new','challenge','registration','wife','2026-09-07','2099-01-01','${legacyHouseholdId}')`)).toThrow(/LEGACY_AUTH_DISABLED/)
    expect(() => sql('UPDATE households SET legacy_auth_disabled_at=NULL')).toThrow(/LEGACY_STOP_IMMUTABLE/)
  })
})
