# デプロイ

フロントエンド・APIともCloudflare Workersにホストする。デプロイはWorkers Builds（Git連携）による自動デプロイ。

## 構成

| Worker | 設定ファイル | 内容 |
|--------|------------|------|
| `score-splitter-web` | `wrangler.jsonc`（root） | Next.jsフロントエンド（OpenNext） |
| `score-splitter-api` | `cloudflare/worker/wrangler.jsonc` | Worker API + D1 |

URLはいずれも `https://<worker名>.<account-subdomain>.workers.dev`。

## Workers Builds（Git連携）の設定値

Cloudflareダッシュボード → Workers & Pages で、同一リポジトリに対して2プロジェクトを設定する。

| 項目 | score-splitter-web（フロント） | score-splitter-api（API） |
|------|------------------------------|--------------------------|
| Root directory | `/` | `/` |
| Build command | `npx opennextjs-cloudflare build` | （空欄。wranglerがdeploy時にバンドル） |
| Deploy command | `npx opennextjs-cloudflare deploy` | `npx wrangler deploy --config cloudflare/worker/wrangler.jsonc` |
| Build watch paths（任意） | `src/**` `public/**` | `cloudflare/worker/**` |

**注意**: API側のDeploy commandは必ず `--config cloudflare/worker/wrangler.jsonc` を明示すること。省略するとrootの `wrangler.jsonc`（フロント用）を読んでしまい、フロントを二重デプロイする事故になる。

## シークレット設定

非シークレット変数（URL・WebAuthn RP設定）は root `wrangler.jsonc` の `vars` で管理。シークレットは以下で設定する:

```bash
# フロントエンド（score-splitter-web）
npx wrangler secret put CLOUDFLARE_WORKER_API_TOKEN
npx wrangler secret put APP_PASSWORD_HASH_BASE64

# API（score-splitter-api）
npx wrangler secret put WORKER_API_TOKEN --config cloudflare/worker/wrangler.jsonc
```

`CLOUDFLARE_WORKER_API_TOKEN` と `WORKER_API_TOKEN` は同じ値（フロント→APIの共有Bearerトークン）。

## 手動デプロイ

```bash
npm run deploy         # フロントエンド（OpenNextビルド + deploy）
npm run deploy:worker  # Worker API
npm run preview        # フロントエンドをworkerd上でローカル実行（.dev.varsが必要）
```

## ドメイン変更時のパスキー再登録

WebAuthnのパスキーはRP ID（ドメイン）に紐づくため、ホスティングドメインが変わると既存パスキーは無効になる。パスワードでログインし直し、`/settings` からパスキーを再登録する。旧ドメインのパスキーはD1の `passkey_credentials` に残るが認証にはマッチしないため無害（気になる場合は設定画面から削除）。

## Vercelからの移行メモ（2026-07）

- フロントエンドはVercelホスティングから本構成（OpenNext + Workers Builds）へ移行済み
- Vercel廃止手順: Git連携を解除 → Cloudflare側の安定稼働を確認 → Vercelプロジェクトを削除
- VercelにWorker APIトークンを設定していたため、廃止時に `WORKER_API_TOKEN` / `CLOUDFLARE_WORKER_API_TOKEN` のローテーションを推奨
