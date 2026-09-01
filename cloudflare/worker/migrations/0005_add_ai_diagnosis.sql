ALTER TABLE expenses ADD COLUMN ai_category TEXT NULL
  CHECK (ai_category IS NULL OR ai_category IN ('groceries','dining','household','housing','utilities','communications','transportation','healthcare','clothing_beauty','entertainment','subscriptions','social_gifts','travel','other'));
ALTER TABLE expenses ADD COLUMN ai_category_source TEXT NULL
  CHECK (ai_category_source IS NULL OR ai_category_source = 'ai');
ALTER TABLE expenses ADD COLUMN ai_categorized_at TEXT NULL;

CREATE TABLE ai_diagnoses (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE CHECK (length(month) = 6),
  result_json TEXT NULL,
  input_hash TEXT NULL,
  analysis_version TEXT NULL,
  run_token TEXT NULL,
  run_expires_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
