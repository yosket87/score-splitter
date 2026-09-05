-- 旧版の列指定INSERTと既存キーを維持する互換拡張。世帯分離は後続段階で行う。
CREATE TABLE households (
  id TEXT NOT NULL PRIMARY KEY,
  legacy_auth_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
INSERT INTO households (id, legacy_auth_key, created_at)
VALUES ('3975b870-bbfa-49fd-ae3d-d273c9f6e107', 'legacy', '2026-09-05T00:00:00.000Z');

-- DEFAULTなしのnullable FKにより、旧版のNULL書込を継続して許可する。
ALTER TABLE incomes ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE expenses ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE carryovers ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE sessions ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE passkey_credentials ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE webauthn_challenges ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE ai_diagnoses ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE ai_execution_guard ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE ai_diagnosis_source_revision ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE month_payment_revisions ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE payment_operations ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE payment_records ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE payment_voids ADD COLUMN household_id TEXT REFERENCES households(id);
