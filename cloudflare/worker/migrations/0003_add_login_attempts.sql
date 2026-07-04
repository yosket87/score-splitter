CREATE TABLE login_attempts (
  attempt_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  window_start TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_login_attempts_updated_at ON login_attempts(updated_at);
