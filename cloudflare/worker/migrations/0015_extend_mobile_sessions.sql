-- iOS向けセッションを365日まで許可する。Webの発行期限はアプリ側で1時間に制限する。
-- 既存セッションと、期限の後付け延長を禁止するUPDATEトリガーは保持する。
DROP TRIGGER sessions_firebase_insert;

CREATE TRIGGER sessions_firebase_insert BEFORE INSERT ON sessions WHEN NEW.auth_method='firebase'
BEGIN SELECT (CASE WHEN NOT EXISTS(
 SELECT 1 FROM users u JOIN firebase_identities i ON i.user_id=u.id AND i.id=NEW.firebase_identity_id AND i.revoked_at IS NULL
 JOIN household_memberships m ON m.user_id=u.id AND m.id=NEW.membership_id AND m.household_id=NEW.household_id AND m.revoked_at IS NULL
 WHERE u.id=NEW.user_id AND u.active=1 AND u.session_epoch=NEW.session_epoch AND NEW.firebase_auth_time>u.firebase_auth_time_floor
 AND NEW.firebase_auth_time<=CAST(strftime('%s','now') AS INTEGER)
 AND (SELECT COUNT(*) FROM household_memberships WHERE user_id=u.id AND revoked_at IS NULL)=1
 AND julianday(NEW.expires_at)>julianday(NEW.created_at) AND julianday(NEW.expires_at)<=julianday(NEW.created_at,'+365 days') AND julianday(NEW.expires_at)>julianday('now')
) THEN RAISE(ABORT,'FIREBASE_SESSION_INVALID') END); END;
