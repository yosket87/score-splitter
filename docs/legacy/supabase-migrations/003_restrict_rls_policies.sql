-- RLSポリシーを全削除してanon keyからのアクセスを完全に拒否する
-- RLS有効 + ポリシーなし = デフォルトで全拒否
-- service role keyはRLSをバイパスするため、Server Actionsからの操作は引き続き可能

DROP POLICY IF EXISTS "Allow all for authenticated" ON incomes;
DROP POLICY IF EXISTS "Allow all for authenticated" ON expenses;
DROP POLICY IF EXISTS "Allow all for authenticated" ON carryovers;
DROP POLICY IF EXISTS "Allow read for app_settings" ON app_settings;
