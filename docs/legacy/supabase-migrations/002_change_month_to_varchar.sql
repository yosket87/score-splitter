-- 月カラムをDATE型からVARCHAR(6)型に変更
-- 既存データをYYYY-MM-DD形式からYYYYMM形式に変換

-- incomes テーブル
ALTER TABLE incomes
  ALTER COLUMN month TYPE VARCHAR(6)
  USING TO_CHAR(month, 'YYYYMM');

-- expenses テーブル
ALTER TABLE expenses
  ALTER COLUMN month TYPE VARCHAR(6)
  USING TO_CHAR(month, 'YYYYMM');

-- carryovers テーブル
ALTER TABLE carryovers
  ALTER COLUMN month TYPE VARCHAR(6)
  USING TO_CHAR(month, 'YYYYMM');

-- CHECKを追加（6桁の数字形式を保証）
ALTER TABLE incomes ADD CONSTRAINT incomes_month_format CHECK (month ~ '^\d{6}$');
ALTER TABLE expenses ADD CONSTRAINT expenses_month_format CHECK (month ~ '^\d{6}$');
ALTER TABLE carryovers ADD CONSTRAINT carryovers_month_format CHECK (month ~ '^\d{6}$');
