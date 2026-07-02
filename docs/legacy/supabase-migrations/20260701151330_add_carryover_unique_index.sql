-- 同一月内で同じ繰越明細が重複登録されることを防ぐ
CREATE UNIQUE INDEX IF NOT EXISTS idx_carryovers_unique_month_label_amount_person
  ON carryovers(month, label, amount, person);
