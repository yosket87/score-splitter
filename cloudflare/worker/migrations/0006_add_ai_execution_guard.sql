CREATE TABLE ai_execution_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  run_token TEXT NULL,
  run_expires_at TEXT NULL,
  last_started_at TEXT NULL,
  usage_date TEXT NOT NULL,
  daily_count INTEGER NOT NULL DEFAULT 0 CHECK (daily_count >= 0),
  updated_at TEXT NOT NULL
);

INSERT INTO ai_execution_guard
  (id, run_token, run_expires_at, last_started_at, usage_date, daily_count, updated_at)
VALUES
  (1, NULL, NULL, NULL, '1970-01-01', 0, '1970-01-01T00:00:00.000Z');

CREATE TRIGGER release_ai_execution_guard
AFTER UPDATE OF run_token ON ai_diagnoses
WHEN OLD.run_token IS NOT NULL AND NEW.run_token IS NULL
BEGIN
  UPDATE ai_execution_guard
  SET run_token = NULL, run_expires_at = NULL
  WHERE id = 1 AND run_token = OLD.run_token;
END;
