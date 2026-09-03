CREATE TABLE ai_diagnosis_source_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL
);

INSERT INTO ai_diagnosis_source_revision (id, revision, updated_at)
VALUES (1, 0, '1970-01-01T00:00:00.000Z');

CREATE TRIGGER increment_ai_revision_after_income_insert
AFTER INSERT ON incomes
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_income_update
AFTER UPDATE OF month, amount ON incomes
WHEN OLD.month IS NOT NEW.month OR OLD.amount IS NOT NEW.amount
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_income_delete
AFTER DELETE ON incomes
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_expense_insert
AFTER INSERT ON expenses
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_expense_update
AFTER UPDATE OF month, label, amount, is_carryover ON expenses
WHEN OLD.month IS NOT NEW.month
  OR OLD.label IS NOT NEW.label
  OR OLD.amount IS NOT NEW.amount
  OR OLD.is_carryover IS NOT NEW.is_carryover
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_expense_delete
AFTER DELETE ON expenses
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_carryover_insert
AFTER INSERT ON carryovers
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_carryover_update
AFTER UPDATE OF month, amount, is_cleared ON carryovers
WHEN OLD.month IS NOT NEW.month
  OR OLD.amount IS NOT NEW.amount
  OR OLD.is_cleared IS NOT NEW.is_cleared
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER increment_ai_revision_after_carryover_delete
AFTER DELETE ON carryovers
BEGIN
  UPDATE ai_diagnosis_source_revision
  SET revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;
