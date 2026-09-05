-- 明細の編集可否とは独立した、振込確認時点の変更検知と追記専用台帳。
CREATE TABLE month_payment_revisions (
 month TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(typeof(revision) = 'integer' AND revision BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE payment_operations (
 id TEXT PRIMARY KEY, month TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('record','correct','void')),
 expected_revision INTEGER NOT NULL CHECK(typeof(expected_revision) = 'integer' AND expected_revision BETWEEN 0 AND 9007199254740990),
 input_json TEXT NOT NULL CHECK(json_valid(input_json)), result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 actor_person TEXT CHECK(actor_person IN ('husband','wife')), actor_auth_method TEXT NOT NULL CHECK(actor_auth_method IN ('password','passkey')), created_at TEXT NOT NULL
);
CREATE TABLE payment_records (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE REFERENCES payment_operations(id), month TEXT NOT NULL,
 signed_yen INTEGER NOT NULL CHECK(typeof(signed_yen) = 'integer' AND signed_yen != 0 AND signed_yen BETWEEN -9007199254740991 AND 9007199254740991),
 paid_on TEXT NOT NULL CHECK(length(paid_on) = 10 AND date(paid_on, '+0 days') IS paid_on), created_at TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), calculation_version TEXT NOT NULL, rounding_version TEXT NOT NULL
);
CREATE TABLE payment_voids (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE REFERENCES payment_operations(id), payment_id TEXT NOT NULL UNIQUE REFERENCES payment_records(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500), created_at TEXT NOT NULL
);
CREATE INDEX idx_payment_records_month ON payment_records(month);
CREATE INDEX idx_payment_operations_month ON payment_operations(month);
CREATE TRIGGER payment_operation_revision BEFORE INSERT ON payment_operations BEGIN
 SELECT CASE WHEN COALESCE((SELECT revision FROM month_payment_revisions WHERE month = NEW.month),0) != NEW.expected_revision THEN RAISE(ABORT,'PAYMENT_REVISION_CONFLICT') END;
END;
CREATE TRIGGER payment_record_operation BEFORE INSERT ON payment_records BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations WHERE id = NEW.operation_id AND month = NEW.month AND kind IN ('record','correct')) THEN RAISE(ABORT,'PAYMENT_OPERATION_INVALID') END;
END;
CREATE TRIGGER payment_void_operation BEFORE INSERT ON payment_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payment_operations o JOIN payment_records p ON p.month = o.month WHERE o.id = NEW.operation_id AND p.id = NEW.payment_id AND o.kind IN ('correct','void')) THEN RAISE(ABORT,'PAYMENT_OPERATION_INVALID') END;
END;
CREATE TRIGGER payment_operations_immutable_update BEFORE UPDATE ON payment_operations BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_operations_immutable_delete BEFORE DELETE ON payment_operations BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_records_immutable_update BEFORE UPDATE ON payment_records BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_records_immutable_delete BEFORE DELETE ON payment_records BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_voids_immutable_update BEFORE UPDATE ON payment_voids BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER payment_voids_immutable_delete BEFORE DELETE ON payment_voids BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER incomes_payment_insert AFTER INSERT ON incomes BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(NEW.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER incomes_payment_delete AFTER DELETE ON incomes BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(OLD.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER incomes_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at ON incomes BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(OLD.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(month,revision) SELECT NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER expenses_payment_insert AFTER INSERT ON expenses BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(NEW.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER expenses_payment_delete AFTER DELETE ON expenses BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(OLD.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER expenses_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_carryover ON expenses BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(OLD.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(month,revision) SELECT NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER carryovers_payment_insert AFTER INSERT ON carryovers BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(NEW.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER carryovers_payment_delete AFTER DELETE ON carryovers BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(OLD.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER carryovers_payment_update AFTER UPDATE OF id, month, label, amount, person, created_at, is_cleared ON carryovers BEGIN
 INSERT INTO month_payment_revisions(month,revision) VALUES(OLD.month,1) ON CONFLICT(month) DO UPDATE SET revision=revision+1;
 INSERT INTO month_payment_revisions(month,revision) SELECT NEW.month,1 WHERE NEW.month != OLD.month ON CONFLICT(month) DO UPDATE SET revision=revision+1;
END;
