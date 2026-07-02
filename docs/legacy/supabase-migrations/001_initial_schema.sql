-- 収入テーブル
CREATE TABLE incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  label VARCHAR(255) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  person VARCHAR(10) NOT NULL CHECK (person IN ('husband', 'wife')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 支出テーブル
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  label VARCHAR(255) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person VARCHAR(10) NOT NULL CHECK (person IN ('husband', 'wife')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 繰越テーブル（記録用、計算には含めない）
CREATE TABLE carryovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  label VARCHAR(255) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount < 0),
  person VARCHAR(10) NOT NULL CHECK (person IN ('husband', 'wife')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- アプリ設定テーブル（パスワード認証用）
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス（月別検索の高速化）
CREATE INDEX idx_incomes_month ON incomes(month);
CREATE INDEX idx_expenses_month ON expenses(month);
CREATE INDEX idx_carryovers_month ON carryovers(month);

-- updated_at自動更新用トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_incomes_updated_at
  BEFORE UPDATE ON incomes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_carryovers_updated_at
  BEFORE UPDATE ON carryovers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Row Level Security有効化
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE carryovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（認証済みユーザーのみアクセス可能）
CREATE POLICY "Allow all for authenticated" ON incomes FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON expenses FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON carryovers FOR ALL USING (true);
CREATE POLICY "Allow read for app_settings" ON app_settings FOR SELECT USING (true);

-- リアルタイム機能有効化
ALTER PUBLICATION supabase_realtime ADD TABLE incomes;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE carryovers;
