# Cloudflare D1移行手順

SupabaseからCloudflare D1へ一回限りでデータを移行するための手順です。

## 移行対象

移行するテーブル:

- `incomes`
- `expenses`
- `carryovers`
- `passkey_credentials`

移行しないテーブル:

- `sessions`: 切り替え後に再ログインする
- `webauthn_challenges`: 5分TTLの一時データ
- `app_settings`: `APP_PASSWORD_HASH_BASE64`環境変数へ集約する

## 手順

1. Supabaseから対象テーブルをJSONでエクスポートします。

   ```json
   {
     "incomes": [],
     "expenses": [],
     "carryovers": [],
     "passkey_credentials": []
   }
   ```

2. D1用SQLへ変換します。

   ```bash
   npm run migrate:supabase-to-d1 -- supabase-export.json d1-import.sql
   ```

3. D1データベースを作成し、`cloudflare/worker/wrangler.jsonc`の`database_id`を更新します。

   ```bash
   npx wrangler d1 create score-splitter
   ```

4. D1スキーマを適用します。

   ```bash
   cd cloudflare/worker
   npx wrangler d1 migrations apply score-splitter --remote
   ```

5. 変換済みSQLを投入します。

   ```bash
   npx wrangler d1 execute score-splitter --remote --file ../../d1-import.sql
   ```

6. WorkerのSecretを設定します。

   ```bash
   cd cloudflare/worker
   npx wrangler secret put WORKER_API_TOKEN
   ```

7. Next.js側に以下の環境変数を設定します。

   ```text
   CLOUDFLARE_WORKER_API_URL=https://<worker-domain>
   CLOUDFLARE_WORKER_API_TOKEN=<WORKER_API_TOKENと同じ値>
   APP_PASSWORD_HASH_BASE64=<bcryptハッシュをBase64化した値>
   ```

8. 切り替え後、全ユーザーは再ログインします。
