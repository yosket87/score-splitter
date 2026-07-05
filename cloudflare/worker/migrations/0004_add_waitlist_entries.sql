-- 0004_add_waitlist_entries.sql
-- ウェイトリスト登録（LP経由の需要検証用）
CREATE TABLE waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  price_intent TEXT NOT NULL CHECK (price_intent IN ('free_only', 'paid_ok')),
  simulator_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
