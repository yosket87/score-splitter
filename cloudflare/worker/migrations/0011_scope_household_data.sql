-- 全入口停止・旧AI処理drain・停止後snapshot確認後に適用する。0012は別段階。
-- 通常CHECK作業表を同じmigration内で作成・削除する。実行単位の原子性はWranglerが管理する。
CREATE TABLE _household_migration_assert (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM households) = 1
  AND EXISTS (SELECT 1 FROM households WHERE id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' AND legacy_auth_key = 'legacy')
THEN 1 ELSE 0 END;

-- 不明所属を修復しない。認証前challengeは無所属だけを許す。
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM incomes WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM expenses WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM carryovers WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM sessions WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM passkey_credentials WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM webauthn_challenges WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM ai_diagnoses WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM ai_execution_guard WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM month_payment_revisions WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payment_operations WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payment_records WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payment_voids WHERE household_id IS NOT NULL AND household_id <> '3975b870-bbfa-49fd-ae3d-d273c9f6e107') THEN 1 ELSE 0 END;

INSERT INTO _household_migration_assert (ok)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM webauthn_challenges WHERE type IS NULL OR type NOT IN ('registration', 'authentication') OR (type = 'authentication' AND household_id IS NOT NULL))
  AND NOT EXISTS (SELECT 1 FROM sessions WHERE auth_method IS NULL OR auth_method NOT IN ('password', 'passkey'))
  AND NOT EXISTS (SELECT 1 FROM payment_operations WHERE actor_auth_method IS NULL OR actor_auth_method NOT IN ('password', 'passkey'))
THEN 1 ELSE 0 END;

-- DELETE禁止は維持し、UPDATE禁止だけを補完の間解除する。
DROP TRIGGER payment_operations_immutable_update;
DROP TRIGGER payment_records_immutable_update;
DROP TRIGGER payment_voids_immutable_update;

UPDATE incomes SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE expenses SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE carryovers SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE sessions SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE passkey_credentials SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE webauthn_challenges SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL AND type = 'registration';
UPDATE ai_diagnoses SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE ai_execution_guard SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE ai_diagnosis_source_revision SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE month_payment_revisions SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE payment_operations SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE payment_records SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;
UPDATE payment_voids SET household_id = '3975b870-bbfa-49fd-ae3d-d273c9f6e107' WHERE household_id IS NULL;

INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM ai_execution_guard WHERE id=1)=1 THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM ai_diagnosis_source_revision WHERE id=1)=1 THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_execution_guard WHERE run_token IS NOT NULL) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnoses WHERE run_token IS NOT NULL) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payment_records p JOIN payment_operations o ON o.id=p.operation_id WHERE p.month<>o.month OR o.kind NOT IN ('record','correct')) THEN 1 ELSE 0 END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payment_voids v JOIN payment_records p ON p.id=v.payment_id JOIN payment_operations o ON o.id=v.operation_id WHERE p.month<>o.month OR o.kind NOT IN ('correct','void')) THEN 1 ELSE 0 END;

-- 既知triggerだけを明示解除し、未知の依存を黙って破棄しない。
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name NOT IN ('release_ai_execution_guard','increment_ai_revision_after_income_insert','increment_ai_revision_after_income_update','increment_ai_revision_after_income_delete','increment_ai_revision_after_expense_insert','increment_ai_revision_after_expense_update','increment_ai_revision_after_expense_delete','increment_ai_revision_after_carryover_insert','increment_ai_revision_after_carryover_update','increment_ai_revision_after_carryover_delete','payment_operation_revision','payment_record_operation','payment_void_operation','payment_operations_immutable_update','payment_operations_immutable_delete','payment_records_immutable_update','payment_records_immutable_delete','payment_voids_immutable_update','payment_voids_immutable_delete','incomes_payment_insert','incomes_payment_delete','incomes_payment_update','expenses_payment_insert','expenses_payment_delete','expenses_payment_update','carryovers_payment_insert','carryovers_payment_delete','carryovers_payment_update')) THEN 1 ELSE 0 END;
DROP TRIGGER release_ai_execution_guard;
DROP TRIGGER increment_ai_revision_after_income_insert;
DROP TRIGGER increment_ai_revision_after_income_update;
DROP TRIGGER increment_ai_revision_after_income_delete;
DROP TRIGGER increment_ai_revision_after_expense_insert;
DROP TRIGGER increment_ai_revision_after_expense_update;
DROP TRIGGER increment_ai_revision_after_expense_delete;
DROP TRIGGER increment_ai_revision_after_carryover_insert;
DROP TRIGGER increment_ai_revision_after_carryover_update;
DROP TRIGGER increment_ai_revision_after_carryover_delete;
DROP TRIGGER payment_operation_revision;
DROP TRIGGER payment_record_operation;
DROP TRIGGER payment_void_operation;
DROP TRIGGER payment_operations_immutable_delete;
DROP TRIGGER payment_records_immutable_delete;
DROP TRIGGER payment_voids_immutable_delete;
DROP TRIGGER incomes_payment_insert;
DROP TRIGGER incomes_payment_delete;
DROP TRIGGER incomes_payment_update;
DROP TRIGGER expenses_payment_insert;
DROP TRIGGER expenses_payment_delete;
DROP TRIGGER expenses_payment_update;
DROP TRIGGER carryovers_payment_insert;
DROP TRIGGER carryovers_payment_delete;
DROP TRIGGER carryovers_payment_update;

CREATE TABLE ai_diagnoses_new (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK (length(month) = 6),
  result_json TEXT NULL,
  input_hash TEXT NULL,
  analysis_version TEXT NULL,
  run_token TEXT NULL,
  run_expires_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,month)
);
INSERT INTO ai_diagnoses_new (id,month,result_json,input_hash,analysis_version,run_token,run_expires_at,created_at,updated_at,household_id) SELECT id,month,result_json,input_hash,analysis_version,run_token,run_expires_at,created_at,updated_at,household_id FROM ai_diagnoses;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM ai_diagnoses)=(SELECT COUNT(*) FROM ai_diagnoses_new) AND NOT EXISTS(SELECT id,month,result_json,input_hash,analysis_version,run_token,run_expires_at,created_at,updated_at,household_id FROM ai_diagnoses EXCEPT SELECT id,month,result_json,input_hash,analysis_version,run_token,run_expires_at,created_at,updated_at,household_id FROM ai_diagnoses_new) AND NOT EXISTS(SELECT id,month,result_json,input_hash,analysis_version,run_token,run_expires_at,created_at,updated_at,household_id FROM ai_diagnoses_new EXCEPT SELECT id,month,result_json,input_hash,analysis_version,run_token,run_expires_at,created_at,updated_at,household_id FROM ai_diagnoses) THEN 1 ELSE 0 END;

CREATE TABLE ai_execution_guard_new (
  id INTEGER NOT NULL CHECK (id = 1),
  run_token TEXT NULL,
  run_expires_at TEXT NULL,
  last_started_at TEXT NULL,
  usage_date TEXT NOT NULL,
  daily_count INTEGER NOT NULL DEFAULT 0 CHECK (daily_count >= 0),
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 PRIMARY KEY(household_id)
);
INSERT INTO ai_execution_guard_new (id,run_token,run_expires_at,last_started_at,usage_date,daily_count,updated_at,household_id) SELECT id,run_token,run_expires_at,last_started_at,usage_date,daily_count,updated_at,household_id FROM ai_execution_guard;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM ai_execution_guard)=(SELECT COUNT(*) FROM ai_execution_guard_new) AND NOT EXISTS(SELECT id,run_token,run_expires_at,last_started_at,usage_date,daily_count,updated_at,household_id FROM ai_execution_guard EXCEPT SELECT id,run_token,run_expires_at,last_started_at,usage_date,daily_count,updated_at,household_id FROM ai_execution_guard_new) AND NOT EXISTS(SELECT id,run_token,run_expires_at,last_started_at,usage_date,daily_count,updated_at,household_id FROM ai_execution_guard_new EXCEPT SELECT id,run_token,run_expires_at,last_started_at,usage_date,daily_count,updated_at,household_id FROM ai_execution_guard) THEN 1 ELSE 0 END;

CREATE TABLE ai_diagnosis_source_revision_new (
  id INTEGER NOT NULL CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 PRIMARY KEY(household_id)
);
INSERT INTO ai_diagnosis_source_revision_new (id,revision,updated_at,household_id) SELECT id,revision,updated_at,household_id FROM ai_diagnosis_source_revision;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM ai_diagnosis_source_revision)=(SELECT COUNT(*) FROM ai_diagnosis_source_revision_new) AND NOT EXISTS(SELECT id,revision,updated_at,household_id FROM ai_diagnosis_source_revision EXCEPT SELECT id,revision,updated_at,household_id FROM ai_diagnosis_source_revision_new) AND NOT EXISTS(SELECT id,revision,updated_at,household_id FROM ai_diagnosis_source_revision_new EXCEPT SELECT id,revision,updated_at,household_id FROM ai_diagnosis_source_revision) THEN 1 ELSE 0 END;

CREATE TABLE month_payment_revisions_new (
 month TEXT NOT NULL, revision INTEGER NOT NULL CHECK(typeof(revision) = 'integer' AND revision BETWEEN 0 AND 9007199254740991)
, household_id TEXT NOT NULL REFERENCES households(id),
 PRIMARY KEY(household_id,month)
);
INSERT INTO month_payment_revisions_new (month,revision,household_id) SELECT month,revision,household_id FROM month_payment_revisions;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM month_payment_revisions)=(SELECT COUNT(*) FROM month_payment_revisions_new) AND NOT EXISTS(SELECT month,revision,household_id FROM month_payment_revisions EXCEPT SELECT month,revision,household_id FROM month_payment_revisions_new) AND NOT EXISTS(SELECT month,revision,household_id FROM month_payment_revisions_new EXCEPT SELECT month,revision,household_id FROM month_payment_revisions) THEN 1 ELSE 0 END;

CREATE TABLE payment_operations_new (
 id TEXT NOT NULL, month TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('record','correct','void')),
 expected_revision INTEGER NOT NULL CHECK(typeof(expected_revision) = 'integer' AND expected_revision BETWEEN 0 AND 9007199254740990),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)), result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 actor_person TEXT CHECK(actor_person IN ('husband','wife')), actor_auth_method TEXT NOT NULL CHECK(actor_auth_method IN ('password','passkey')), created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 PRIMARY KEY(household_id,id)
);
INSERT INTO payment_operations_new (id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id) SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id FROM payment_operations;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM payment_operations)=(SELECT COUNT(*) FROM payment_operations_new) AND NOT EXISTS(SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id FROM payment_operations EXCEPT SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id FROM payment_operations_new) AND NOT EXISTS(SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id FROM payment_operations_new EXCEPT SELECT id,month,kind,expected_revision,input_json,result_json,actor_person,actor_auth_method,created_at,household_id FROM payment_operations) THEN 1 ELSE 0 END;

CREATE TABLE payment_records_new (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, month TEXT NOT NULL,
 signed_yen INTEGER NOT NULL CHECK(typeof(signed_yen) = 'integer' AND signed_yen != 0 AND signed_yen BETWEEN -9007199254740991 AND 9007199254740991),
 paid_on TEXT NOT NULL CHECK(length(paid_on) = 10 AND date(paid_on, '+0 days') IS paid_on), created_at TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), calculation_version TEXT NOT NULL, rounding_version TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,id), UNIQUE(household_id,operation_id), FOREIGN KEY(household_id,operation_id) REFERENCES payment_operations_new(household_id,id)
);
INSERT INTO payment_records_new (id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id) SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM payment_records)=(SELECT COUNT(*) FROM payment_records_new) AND NOT EXISTS(SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records EXCEPT SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records_new) AND NOT EXISTS(SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records_new EXCEPT SELECT id,operation_id,month,signed_yen,paid_on,created_at,snapshot_json,calculation_version,rounding_version,household_id FROM payment_records) THEN 1 ELSE 0 END;

CREATE TABLE payment_voids_new (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, payment_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500), created_at TEXT NOT NULL
, household_id TEXT NOT NULL REFERENCES households(id),
 UNIQUE(household_id,operation_id), UNIQUE(household_id,payment_id), FOREIGN KEY(household_id,operation_id) REFERENCES payment_operations_new(household_id,id), FOREIGN KEY(household_id,payment_id) REFERENCES payment_records_new(household_id,id)
);
INSERT INTO payment_voids_new (id,operation_id,payment_id,reason,created_at,household_id) SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids;
INSERT INTO _household_migration_assert SELECT CASE WHEN (SELECT COUNT(*) FROM payment_voids)=(SELECT COUNT(*) FROM payment_voids_new) AND NOT EXISTS(SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids EXCEPT SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids_new) AND NOT EXISTS(SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids_new EXCEPT SELECT id,operation_id,payment_id,reason,created_at,household_id FROM payment_voids) THEN 1 ELSE 0 END;

-- コピー検証完了。旧子から削除し、新親からrenameする。
DROP TABLE payment_voids;
DROP TABLE payment_records;
DROP TABLE payment_operations;
DROP TABLE month_payment_revisions;
DROP TABLE ai_diagnosis_source_revision;
DROP TABLE ai_execution_guard;
DROP TABLE ai_diagnoses;
ALTER TABLE ai_diagnoses_new RENAME TO ai_diagnoses;
ALTER TABLE ai_execution_guard_new RENAME TO ai_execution_guard;
ALTER TABLE ai_diagnosis_source_revision_new RENAME TO ai_diagnosis_source_revision;
ALTER TABLE month_payment_revisions_new RENAME TO month_payment_revisions;
ALTER TABLE payment_operations_new RENAME TO payment_operations;
ALTER TABLE payment_records_new RENAME TO payment_records;
ALTER TABLE payment_voids_new RENAME TO payment_voids;
DROP INDEX idx_carryovers_unique_month_label_amount_person;
CREATE UNIQUE INDEX idx_carryovers_unique_household_month_label_amount_person ON carryovers(household_id,month,label,amount,person);
CREATE INDEX idx_incomes_household_month ON incomes(household_id,month);
CREATE INDEX idx_expenses_household_month ON expenses(household_id,month);
CREATE INDEX idx_carryovers_household_month ON carryovers(household_id,month);
CREATE INDEX idx_payment_records_household_month ON payment_records(household_id,month);
CREATE INDEX idx_payment_operations_household_month ON payment_operations(household_id,month);

CREATE TRIGGER release_ai_execution_guard
AFTER UPDATE OF run_token ON ai_diagnoses
WHEN OLD.run_token IS NOT NULL AND NEW.run_token IS NULL
BEGIN
  UPDATE ai_execution_guard
  SET run_token = NULL, run_expires_at = NULL
  WHERE household_id = NEW.household_id AND run_token = OLD.run_token;
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

CREATE TRIGGER increment_ai_revision_after_income_delete
AFTER DELETE ON incomes
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

CREATE TRIGGER increment_ai_revision_after_expense_delete
AFTER DELETE ON expenses
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

CREATE TRIGGER increment_ai_revision_after_carryover_delete
AFTER DELETE ON carryovers
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ai_diagnosis_source_revision WHERE household_id=OLD.household_id) THEN RAISE(ABORT,'AI_REVISION_MISSING') END;
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE household_id = OLD.household_id;
END;

CREATE TRIGGER payment_operation_revision BEFORE INSERT ON payment_operations BEGIN
 SELECT CASE WHEN COALESCE((SELECT revision FROM month_payment_revisions WHERE household_id = NEW.household_id AND month = NEW.month),0) != NEW.expected_revision THEN RAISE(ABORT,'PAYMENT_REVISION_CONFLICT') END;
END;

CREATE TRIGGER payment_record_operation BEFORE INSERT ON payment_records BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations WHERE household_id = NEW.household_id AND id = NEW.operation_id AND month = NEW.month AND kind IN ('record','correct')) THEN RAISE(ABORT,'PAYMENT_OPERATION_INVALID') END;
END;

CREATE TRIGGER payment_void_operation BEFORE INSERT ON payment_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations o JOIN payment_records p ON p.household_id = o.household_id AND p.month = o.month WHERE o.household_id = NEW.household_id AND o.id = NEW.operation_id AND p.id = NEW.payment_id AND o.kind IN ('correct','void')) THEN RAISE(ABORT,'PAYMENT_OPERATION_INVALID') END;
END;

CREATE TRIGGER payment_operations_immutable_update BEFORE UPDATE ON payment_operations BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_operations_immutable_delete BEFORE DELETE ON payment_operations BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_records_immutable_update BEFORE UPDATE ON payment_records BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_records_immutable_delete BEFORE DELETE ON payment_records BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_voids_immutable_update BEFORE UPDATE ON payment_voids BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER payment_voids_immutable_delete BEFORE DELETE ON payment_voids BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

CREATE TRIGGER incomes_payment_insert AFTER INSERT ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER incomes_payment_delete AFTER DELETE ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER incomes_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at ON incomes BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER expenses_payment_insert AFTER INSERT ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER expenses_payment_delete AFTER DELETE ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER expenses_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_carryover ON expenses BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER carryovers_payment_insert AFTER INSERT ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(NEW.household_id,NEW.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER carryovers_payment_delete AFTER DELETE ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;

CREATE TRIGGER carryovers_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_cleared ON carryovers BEGIN
 INSERT INTO month_payment_revisions(household_id,month,revision) VALUES(OLD.household_id,OLD.month,1) ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(household_id,month,revision) SELECT NEW.household_id,NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(household_id,month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER incomes_household_insert BEFORE INSERT ON incomes WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER incomes_household_update BEFORE UPDATE ON incomes WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER expenses_household_insert BEFORE INSERT ON expenses WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER expenses_household_update BEFORE UPDATE ON expenses WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER carryovers_household_insert BEFORE INSERT ON carryovers WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER carryovers_household_update BEFORE UPDATE ON carryovers WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER sessions_household_insert BEFORE INSERT ON sessions WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER sessions_household_update BEFORE UPDATE ON sessions WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER passkey_credentials_household_insert BEFORE INSERT ON passkey_credentials WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER passkey_credentials_household_update BEFORE UPDATE ON passkey_credentials WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER webauthn_challenges_household_insert BEFORE INSERT ON webauthn_challenges WHEN NEW.type NOT IN ('registration','authentication') OR NEW.type IS NULL OR (NEW.type='registration' AND NEW.household_id IS NULL) OR (NEW.type='authentication' AND NEW.household_id IS NOT NULL) BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER webauthn_challenges_household_update BEFORE UPDATE ON webauthn_challenges WHEN (NEW.type NOT IN ('registration','authentication') OR NEW.type IS NULL OR (NEW.type='registration' AND NEW.household_id IS NULL) OR (NEW.type='authentication' AND NEW.household_id IS NOT NULL)) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER ai_diagnoses_household_insert BEFORE INSERT ON ai_diagnoses WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER ai_diagnoses_household_update BEFORE UPDATE ON ai_diagnoses WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER ai_execution_guard_household_insert BEFORE INSERT ON ai_execution_guard WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER ai_execution_guard_household_update BEFORE UPDATE ON ai_execution_guard WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER ai_diagnosis_source_revision_household_insert BEFORE INSERT ON ai_diagnosis_source_revision WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER ai_diagnosis_source_revision_household_update BEFORE UPDATE ON ai_diagnosis_source_revision WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
CREATE TRIGGER month_payment_revisions_household_insert BEFORE INSERT ON month_payment_revisions WHEN NEW.household_id IS NULL BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_REQUIRED'); END;
CREATE TRIGGER month_payment_revisions_household_update BEFORE UPDATE ON month_payment_revisions WHEN (NEW.household_id IS NULL) OR OLD.household_id IS NOT NEW.household_id BEGIN SELECT RAISE(ABORT,'HOUSEHOLD_IMMUTABLE'); END;
INSERT INTO _household_migration_assert SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END;
DROP TABLE _household_migration_assert;
