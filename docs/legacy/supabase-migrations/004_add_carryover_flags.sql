-- expenses テーブルに is_carryover フラグを追加（繰越扱いの支出を識別）
ALTER TABLE expenses ADD COLUMN is_carryover BOOLEAN NOT NULL DEFAULT FALSE;

-- carryovers テーブルに is_cleared フラグを追加（清算済みの繰越を識別）
ALTER TABLE carryovers ADD COLUMN is_cleared BOOLEAN NOT NULL DEFAULT FALSE;

-- パフォーマンス用インデックス
CREATE INDEX idx_expenses_month_carryover ON expenses(month, is_carryover);
CREATE INDEX idx_carryovers_month_cleared ON carryovers(month, is_cleared);
