// 失効済みsessionは履歴として残り得る。現在有効であることではなく構造・単調性を検査する。
export function verifyFirebaseIdentityState(query) {
 const rows=query(`SELECT
  (SELECT COUNT(*) FROM users WHERE typeof(firebase_auth_time_floor)<>'integer' OR firebase_auth_time_floor<0 OR firebase_auth_time_floor>9007199254740991) AS invalid_floors,
  (SELECT COUNT(*) FROM sessions s LEFT JOIN users u ON u.id=s.user_id
   LEFT JOIN firebase_identities i ON i.id=s.firebase_identity_id AND i.user_id=s.user_id
   LEFT JOIN household_memberships m ON m.id=s.membership_id AND m.user_id=s.user_id AND m.household_id=s.household_id
   WHERE s.auth_method='firebase' AND (u.id IS NULL OR i.id IS NULL OR m.id IS NULL
    OR typeof(s.firebase_auth_time)<>'integer' OR s.firebase_auth_time<0 OR s.firebase_auth_time>9007199254740991
    OR s.session_epoch>u.session_epoch OR s.oauth_attempt_sequence IS NOT NULL)) AS invalid_sessions;`)
 if(!Array.isArray(rows)||rows.length!==1||rows[0].invalid_floors!==0||rows[0].invalid_sessions!==0) {
  throw new Error('Firebase主体・失効下限・セッションの復元整合性が不正です')
 }
}
