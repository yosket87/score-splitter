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

-- 0008の定義を完全復元する。
CREATE TRIGGER payment_operations_immutable_update BEFORE UPDATE ON payment_operations BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_records_immutable_update BEFORE UPDATE ON payment_records BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_voids_immutable_update BEFORE UPDATE ON payment_voids BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;

DROP TABLE _household_migration_assert;
