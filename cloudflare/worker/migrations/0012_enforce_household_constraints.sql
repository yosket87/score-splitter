-- 全入口停止を維持したまま0011の値を保存して最終制約へ切り替える。NULL追補は行わない。
CREATE TABLE _household_migration_assert (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM households)=1 AND EXISTS(SELECT 1 FROM households WHERE id='3975b870-bbfa-49fd-ae3d-d273c9f6e107' AND legacy_auth_key='legacy') THEN 1 ELSE 0 END;
-- 未知の表・列・索引・trigger・参照はデータ損失を避けるため適用前に拒否する。
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_household_migration_assert'))=16 AND NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_household_migration_assert') AND name NOT IN ('ai_diagnoses','ai_diagnosis_source_revision','ai_execution_guard','carryovers','expenses','households','incomes','login_attempts','month_payment_revisions','passkey_credentials','payment_operations','payment_records','payment_voids','sessions','waitlist_entries','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_household_migration_assert'))=48 AND NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_household_migration_assert') AND name NOT IN ('ai_diagnoses_household_insert','ai_diagnoses_household_update','ai_diagnosis_source_revision_household_insert','ai_diagnosis_source_revision_household_update','ai_execution_guard_household_insert','ai_execution_guard_household_update','carryovers_household_insert','carryovers_household_update','carryovers_payment_delete','carryovers_payment_insert','carryovers_payment_update','expenses_household_insert','expenses_household_update','expenses_payment_delete','expenses_payment_insert','expenses_payment_update','incomes_household_insert','incomes_household_update','incomes_payment_delete','incomes_payment_insert','incomes_payment_update','increment_ai_revision_after_carryover_delete','increment_ai_revision_after_carryover_insert','increment_ai_revision_after_carryover_update','increment_ai_revision_after_expense_delete','increment_ai_revision_after_expense_insert','increment_ai_revision_after_expense_update','increment_ai_revision_after_income_delete','increment_ai_revision_after_income_insert','increment_ai_revision_after_income_update','month_payment_revisions_household_insert','month_payment_revisions_household_update','passkey_credentials_household_insert','passkey_credentials_household_update','payment_operation_revision','payment_operations_immutable_delete','payment_operations_immutable_update','payment_record_operation','payment_records_immutable_delete','payment_records_immutable_update','payment_void_operation','payment_voids_immutable_delete','payment_voids_immutable_update','release_ai_execution_guard','sessions_household_insert','sessions_household_update','webauthn_challenges_household_insert','webauthn_challenges_household_update')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_household_migration_assert'))=16 AND NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA','d1_migrations','_household_migration_assert') AND name NOT IN ('idx_carryovers_household_month','idx_carryovers_month','idx_carryovers_month_cleared','idx_carryovers_unique_household_month_label_amount_person','idx_expenses_household_month','idx_expenses_month','idx_expenses_month_carryover','idx_incomes_household_month','idx_incomes_month','idx_login_attempts_updated_at','idx_passkey_credentials_person','idx_payment_operations_household_month','idx_payment_records_household_month','idx_sessions_expires_at','idx_webauthn_challenges_expires_at','idx_webauthn_challenges_lookup')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('incomes'))=8 AND NOT EXISTS(SELECT 1 FROM pragma_table_info('incomes') WHERE name NOT IN ('id','month','label','amount','person','created_at','updated_at','household_id')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM incomes WHERE household_id IS NULL) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('expenses'))=12 AND NOT EXISTS(SELECT 1 FROM pragma_table_info('expenses') WHERE name NOT IN ('id','month','label','amount','person','is_carryover','created_at','updated_at','ai_category','ai_category_source','ai_categorized_at','household_id')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM expenses WHERE household_id IS NULL) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('carryovers'))=9 AND NOT EXISTS(SELECT 1 FROM pragma_table_info('carryovers') WHERE name NOT IN ('id','month','label','amount','person','is_cleared','created_at','updated_at','household_id')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM carryovers WHERE household_id IS NULL) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('sessions'))=6 AND NOT EXISTS(SELECT 1 FROM pragma_table_info('sessions') WHERE name NOT IN ('token','person','auth_method','expires_at','created_at','household_id')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE household_id IS NULL) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('passkey_credentials'))=8 AND NOT EXISTS(SELECT 1 FROM pragma_table_info('passkey_credentials') WHERE name NOT IN ('id','person','public_key_base64','counter','device_name','transports','created_at','household_id')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM passkey_credentials WHERE household_id IS NULL) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('webauthn_challenges'))=7 AND NOT EXISTS(SELECT 1 FROM pragma_table_info('webauthn_challenges') WHERE name NOT IN ('id','challenge','type','person','expires_at','created_at','household_id')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM webauthn_challenges WHERE NOT ((type='registration' AND household_id IS NOT NULL) OR (type='authentication' AND household_id IS NULL))) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;

INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('incomes') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('expenses') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('carryovers') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('sessions') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('passkey_credentials') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('webauthn_challenges') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('households') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('login_attempts') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('waitlist_entries') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('ai_diagnoses') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('ai_execution_guard') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('ai_diagnosis_source_revision') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('month_payment_revisions') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('payment_operations') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('payment_records') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('payment_voids') WHERE "table" IN ('incomes','expenses','carryovers','sessions','passkey_credentials','webauthn_challenges')) THEN 1 ELSE 0 END;

-- コピー中にrevisionを進めない。各triggerは同じ定義で復元する。
DROP TRIGGER carryovers_household_insert;
DROP TRIGGER carryovers_household_update;
DROP TRIGGER carryovers_payment_delete;
DROP TRIGGER carryovers_payment_insert;
DROP TRIGGER carryovers_payment_update;
DROP TRIGGER expenses_household_insert;
DROP TRIGGER expenses_household_update;
DROP TRIGGER expenses_payment_delete;
DROP TRIGGER expenses_payment_insert;
DROP TRIGGER expenses_payment_update;
DROP TRIGGER incomes_household_insert;
DROP TRIGGER incomes_household_update;
DROP TRIGGER incomes_payment_delete;
DROP TRIGGER incomes_payment_insert;
DROP TRIGGER incomes_payment_update;
DROP TRIGGER increment_ai_revision_after_carryover_delete;
DROP TRIGGER increment_ai_revision_after_carryover_insert;
DROP TRIGGER increment_ai_revision_after_carryover_update;
DROP TRIGGER increment_ai_revision_after_expense_delete;
DROP TRIGGER increment_ai_revision_after_expense_insert;
DROP TRIGGER increment_ai_revision_after_expense_update;
DROP TRIGGER increment_ai_revision_after_income_delete;
DROP TRIGGER increment_ai_revision_after_income_insert;
DROP TRIGGER increment_ai_revision_after_income_update;
DROP TRIGGER passkey_credentials_household_insert;
DROP TRIGGER passkey_credentials_household_update;
DROP TRIGGER sessions_household_insert;
DROP TRIGGER sessions_household_update;
DROP TRIGGER webauthn_challenges_household_insert;
DROP TRIGGER webauthn_challenges_household_update;

CREATE TABLE incomes_new (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id));
INSERT INTO incomes_new (id,month,label,amount,person,created_at,updated_at,household_id) SELECT id,month,label,amount,person,created_at,updated_at,household_id FROM incomes;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM incomes)=(SELECT COUNT(*) FROM incomes_new) AND NOT EXISTS(SELECT id,month,label,amount,person,created_at,updated_at,household_id FROM incomes EXCEPT SELECT id,month,label,amount,person,created_at,updated_at,household_id FROM incomes_new) AND NOT EXISTS(SELECT id,month,label,amount,person,created_at,updated_at,household_id FROM incomes_new EXCEPT SELECT id,month,label,amount,person,created_at,updated_at,household_id FROM incomes) THEN 1 ELSE 0 END;

CREATE TABLE expenses_new (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  is_carryover INTEGER NOT NULL DEFAULT 0 CHECK (is_carryover IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, ai_category TEXT NULL
  CHECK (ai_category IS NULL OR ai_category IN ('groceries','dining','household','housing','utilities','communications','transportation','healthcare','clothing_beauty','entertainment','subscriptions','social_gifts','travel','other')), ai_category_source TEXT NULL
  CHECK (ai_category_source IS NULL OR ai_category_source = 'ai'), ai_categorized_at TEXT NULL, household_id TEXT NOT NULL REFERENCES households(id));
INSERT INTO expenses_new (id,month,label,amount,person,is_carryover,created_at,updated_at,ai_category,ai_category_source,ai_categorized_at,household_id) SELECT id,month,label,amount,person,is_carryover,created_at,updated_at,ai_category,ai_category_source,ai_categorized_at,household_id FROM expenses;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM expenses)=(SELECT COUNT(*) FROM expenses_new) AND NOT EXISTS(SELECT id,month,label,amount,person,is_carryover,created_at,updated_at,ai_category,ai_category_source,ai_categorized_at,household_id FROM expenses EXCEPT SELECT id,month,label,amount,person,is_carryover,created_at,updated_at,ai_category,ai_category_source,ai_categorized_at,household_id FROM expenses_new) AND NOT EXISTS(SELECT id,month,label,amount,person,is_carryover,created_at,updated_at,ai_category,ai_category_source,ai_categorized_at,household_id FROM expenses_new EXCEPT SELECT id,month,label,amount,person,is_carryover,created_at,updated_at,ai_category,ai_category_source,ai_categorized_at,household_id FROM expenses) THEN 1 ELSE 0 END;

CREATE TABLE carryovers_new (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  is_cleared INTEGER NOT NULL DEFAULT 0 CHECK (is_cleared IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id));
INSERT INTO carryovers_new (id,month,label,amount,person,is_cleared,created_at,updated_at,household_id) SELECT id,month,label,amount,person,is_cleared,created_at,updated_at,household_id FROM carryovers;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM carryovers)=(SELECT COUNT(*) FROM carryovers_new) AND NOT EXISTS(SELECT id,month,label,amount,person,is_cleared,created_at,updated_at,household_id FROM carryovers EXCEPT SELECT id,month,label,amount,person,is_cleared,created_at,updated_at,household_id FROM carryovers_new) AND NOT EXISTS(SELECT id,month,label,amount,person,is_cleared,created_at,updated_at,household_id FROM carryovers_new EXCEPT SELECT id,month,label,amount,person,is_cleared,created_at,updated_at,household_id FROM carryovers) THEN 1 ELSE 0 END;

CREATE TABLE sessions_new (
  token TEXT PRIMARY KEY CHECK (length(token) = 64),
  person TEXT CHECK (person IN ('husband', 'wife')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('password', 'passkey')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id));
INSERT INTO sessions_new (token,person,auth_method,expires_at,created_at,household_id) SELECT token,person,auth_method,expires_at,created_at,household_id FROM sessions;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM sessions)=(SELECT COUNT(*) FROM sessions_new) AND NOT EXISTS(SELECT token,person,auth_method,expires_at,created_at,household_id FROM sessions EXCEPT SELECT token,person,auth_method,expires_at,created_at,household_id FROM sessions_new) AND NOT EXISTS(SELECT token,person,auth_method,expires_at,created_at,household_id FROM sessions_new EXCEPT SELECT token,person,auth_method,expires_at,created_at,household_id FROM sessions) THEN 1 ELSE 0 END;

CREATE TABLE passkey_credentials_new (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL CHECK (person IN ('husband', 'wife')),
  public_key_base64 TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  transports TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id));
INSERT INTO passkey_credentials_new (id,person,public_key_base64,counter,device_name,transports,created_at,household_id) SELECT id,person,public_key_base64,counter,device_name,transports,created_at,household_id FROM passkey_credentials;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM passkey_credentials)=(SELECT COUNT(*) FROM passkey_credentials_new) AND NOT EXISTS(SELECT id,person,public_key_base64,counter,device_name,transports,created_at,household_id FROM passkey_credentials EXCEPT SELECT id,person,public_key_base64,counter,device_name,transports,created_at,household_id FROM passkey_credentials_new) AND NOT EXISTS(SELECT id,person,public_key_base64,counter,device_name,transports,created_at,household_id FROM passkey_credentials_new EXCEPT SELECT id,person,public_key_base64,counter,device_name,transports,created_at,household_id FROM passkey_credentials) THEN 1 ELSE 0 END;

CREATE TABLE webauthn_challenges_new (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  person TEXT CHECK (person IN ('husband', 'wife')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
, household_id TEXT REFERENCES households(id), CHECK((type='registration' AND household_id IS NOT NULL) OR (type='authentication' AND household_id IS NULL)));
INSERT INTO webauthn_challenges_new (id,challenge,type,person,expires_at,created_at,household_id) SELECT id,challenge,type,person,expires_at,created_at,household_id FROM webauthn_challenges;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM webauthn_challenges)=(SELECT COUNT(*) FROM webauthn_challenges_new) AND NOT EXISTS(SELECT id,challenge,type,person,expires_at,created_at,household_id FROM webauthn_challenges EXCEPT SELECT id,challenge,type,person,expires_at,created_at,household_id FROM webauthn_challenges_new) AND NOT EXISTS(SELECT id,challenge,type,person,expires_at,created_at,household_id FROM webauthn_challenges_new EXCEPT SELECT id,challenge,type,person,expires_at,created_at,household_id FROM webauthn_challenges) THEN 1 ELSE 0 END;

-- 全保持列照合後に旧表を削除する。6表間に親子参照はない。
DROP TABLE incomes;
DROP TABLE expenses;
DROP TABLE carryovers;
DROP TABLE sessions;
DROP TABLE passkey_credentials;
DROP TABLE webauthn_challenges;
ALTER TABLE incomes_new RENAME TO incomes;
ALTER TABLE expenses_new RENAME TO expenses;
ALTER TABLE carryovers_new RENAME TO carryovers;
ALTER TABLE sessions_new RENAME TO sessions;
ALTER TABLE passkey_credentials_new RENAME TO passkey_credentials;
ALTER TABLE webauthn_challenges_new RENAME TO webauthn_challenges;
CREATE INDEX idx_carryovers_household_month ON carryovers(household_id,month);
CREATE INDEX idx_carryovers_month ON carryovers(month);
CREATE INDEX idx_carryovers_month_cleared ON carryovers(month, is_cleared);
CREATE UNIQUE INDEX idx_carryovers_unique_household_month_label_amount_person ON carryovers(household_id,month,label,amount,person);
CREATE INDEX idx_expenses_household_month ON expenses(household_id,month);
CREATE INDEX idx_expenses_month ON expenses(month);
CREATE INDEX idx_expenses_month_carryover ON expenses(month, is_carryover);
CREATE INDEX idx_incomes_household_month ON incomes(household_id,month);
CREATE INDEX idx_incomes_month ON incomes(month);
CREATE INDEX idx_passkey_credentials_person ON passkey_credentials(person);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);
CREATE INDEX idx_webauthn_challenges_lookup ON webauthn_challenges(type, person, created_at);
CREATE TRIGGER carryovers_household_insert BEFORE INSERT ON carryovers WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER carryovers_household_update BEFORE UPDATE ON carryovers WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER carryovers_payment_delete AFTER DELETE ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER carryovers_payment_insert AFTER INSERT ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER carryovers_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_cleared ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER expenses_household_insert BEFORE INSERT ON expenses WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER expenses_household_update BEFORE UPDATE ON expenses WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER expenses_payment_delete AFTER DELETE ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER expenses_payment_insert AFTER INSERT ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER expenses_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_carryover ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER incomes_household_insert BEFORE INSERT ON incomes WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER incomes_household_update BEFORE UPDATE ON incomes WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER incomes_payment_delete AFTER DELETE ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER incomes_payment_insert AFTER INSERT ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER incomes_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER increment_ai_revision_after_carryover_delete
AFTER DELETE ON carryovers
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=OLD.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = OLD.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_carryover_insert
AFTER INSERT ON carryovers
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = NEW.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_carryover_update
AFTER UPDATE OF month, amount, is_cleared ON carryovers
WHEN OLD.month IS NOT NEW.month
  OR OLD.amount IS NOT NEW.amount
  OR OLD.is_cleared IS NOT NEW.is_cleared
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = NEW.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_expense_delete
AFTER DELETE ON expenses
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=OLD.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = OLD.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_expense_insert
AFTER INSERT ON expenses
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = NEW.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_expense_update
AFTER UPDATE OF month, label, amount, is_carryover ON expenses
WHEN OLD.month IS NOT NEW.month
  OR OLD.label IS NOT NEW.label
  OR OLD.amount IS NOT NEW.amount
  OR OLD.is_carryover IS NOT NEW.is_carryover
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = NEW.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_income_delete
AFTER DELETE ON incomes
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=OLD.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = OLD.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_income_insert
AFTER INSERT ON incomes
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = NEW.household_id;
END;
CREATE TRIGGER increment_ai_revision_after_income_update
AFTER UPDATE OF month, amount ON incomes
WHEN OLD.month IS NOT NEW.month OR OLD.amount IS NOT NEW.amount
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=NEW.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = NEW.household_id;
END;
CREATE TRIGGER passkey_credentials_household_insert BEFORE INSERT ON passkey_credentials WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER passkey_credentials_household_update BEFORE UPDATE ON passkey_credentials WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER sessions_household_insert BEFORE INSERT ON sessions WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER sessions_household_update BEFORE UPDATE ON sessions WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER webauthn_challenges_household_insert BEFORE INSERT ON webauthn_challenges WHEN NEW.type NOT IN ('registration','authentication') OR NEW.type IS NULL OR (NEW.type='registration' AND NEW.household_id IS NULL) OR (NEW.type='authentication' AND NEW.household_id IS NOT NULL) BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER webauthn_challenges_household_update BEFORE UPDATE ON webauthn_challenges WHEN (NEW.type NOT IN ('registration','authentication') OR NEW.type IS NULL OR (NEW.type='registration' AND NEW.household_id IS NULL) OR (NEW.type='authentication' AND NEW.household_id IS NOT NULL)) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;
DROP TABLE _household_migration_assert;
