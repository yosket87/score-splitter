-- 実在しない主体と長期fixture期限を使い、復元で失効世代と履歴を確認する。
INSERT INTO users(id,active,session_epoch,oauth_attempt_floor,created_at,updated_at) VALUES
 ('user-a',1,2,10,'2026-09-06','2026-09-06'), ('user-b',1,0,0,'2026-09-06','2026-09-06');
INSERT INTO google_identities(id,user_id,issuer,subject,email,created_at,revoked_at) VALUES
 ('identity-old','user-a','https://accounts.google.com','fixture-old','same@example.invalid','2026-09-06','2026-09-06'),
 ('identity-a','user-a','https://accounts.google.com','fixture-a','same@example.invalid','2026-09-06',NULL),
 ('identity-b','user-b','https://accounts.google.com','fixture-b','same@example.invalid','2026-09-06',NULL);
INSERT INTO household_memberships(id,user_id,household_id,default_person,created_at) VALUES
 ('member-a','user-a','3975b870-bbfa-49fd-ae3d-d273c9f6e107','husband','2026-09-06'),
 ('member-b','user-b','3975b870-bbfa-49fd-ae3d-d273c9f6e107','wife','2026-09-06');
INSERT INTO oauth_login_attempts(sequence,id,browser_binding_hash,state_hash,nonce,code_verifier,created_at,expires_at) VALUES
 (11,'attempt-a',printf('%064d',1),printf('%064d',11),'nonce-a','verifier-a','2026-09-06','2099-01-01'),
 (12,'attempt-b',printf('%064d',2),printf('%064d',12),'nonce-b','verifier-b','2026-09-06','2099-01-01');
UPDATE oauth_login_attempts SET status='processing',claim_id='claim-a',claimed_at='2026-09-06' WHERE id='attempt-a';
UPDATE oauth_login_attempts SET status='completed',verified_issuer='https://accounts.google.com',verified_subject='fixture-a',nonce=NULL,code_verifier=NULL,completed_at='2026-09-06' WHERE id='attempt-a';
UPDATE oauth_login_attempts SET status='processing',claim_id='claim-b',claimed_at='2026-09-06' WHERE id='attempt-b';
UPDATE oauth_login_attempts SET status='completed',verified_issuer='https://accounts.google.com',verified_subject='fixture-b',nonce=NULL,code_verifier=NULL,completed_at='2026-09-06' WHERE id='attempt-b';
INSERT INTO sessions(token,household_id,person,auth_method,created_at,expires_at,user_id,membership_id,session_epoch,oauth_attempt_sequence) VALUES
 (printf('%064d',3),'3975b870-bbfa-49fd-ae3d-d273c9f6e107','husband','google','2026-09-06','2099-01-01','user-a','member-a',2,11),
 (printf('%064d',4),'3975b870-bbfa-49fd-ae3d-d273c9f6e107','wife','google','2026-09-06','2099-01-01','user-b','member-b',0,12);
INSERT INTO google_migration_requests(id,purpose,issuer,subject,code_hash,browser_binding_hash,created_at,expires_at)
 VALUES('grant-a','legacy_enrollment','https://accounts.google.com','fixture-a',printf('%064d',21),printf('%064d',1),'2026-09-06','2099-01-01');
UPDATE google_migration_requests SET status='approved',approved_at='2026-09-06',approval_expires_at='2098-01-01',approved_by='fixture-operator',confirmation_ref='private-fixture-1',approved_household_id='3975b870-bbfa-49fd-ae3d-d273c9f6e107',approved_default_person='husband',legacy_slot='existing-member-1' WHERE id='grant-a';
UPDATE google_migration_requests SET status='consuming',consumption_id='consume-a' WHERE id='grant-a';
UPDATE google_migration_requests SET status='consumed',consumed_at='2026-09-06',consumed_user_id='user-a' WHERE id='grant-a';
INSERT INTO payment_operations(id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id,actor_user_id)
 VALUES('google-record','202610','record',0,'{ "note": "空白  --  保持" }','{}','husband','google','2026-09-06','3975b870-bbfa-49fd-ae3d-d273c9f6e107','user-a');
INSERT INTO payment_records(id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id)
 VALUES('google-payment','google-record','202610',1200,'2026-09-06','2026-09-06','{ "snapshot": "Google  --  履歴" }','v1','v1','3975b870-bbfa-49fd-ae3d-d273c9f6e107');
