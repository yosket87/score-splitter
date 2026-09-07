-- google-identity.sqlの後に適用し、清掃後の残存試行より高い失効番号を残す。
INSERT INTO oauth_login_attempts(sequence,id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at)
 VALUES(100,'attempt-cleaned',printf('%064d',100),printf('%064d',100),'nonce-cleaned','verifier-cleaned','2026-09-06','2099-01-01');
UPDATE users SET session_epoch=1,oauth_attempt_floor=100 WHERE id='user-b';
DELETE FROM oauth_login_attempts WHERE id='attempt-cleaned';
