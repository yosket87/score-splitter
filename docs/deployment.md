# デプロイ

フロントエンド・APIともCloudflare Workersにホストする。デプロイはWorkers Builds（Git連携）による自動デプロイ。

## 構成

| Worker | 設定ファイル | 内容 |
|--------|------------|------|
| `score-splitter-web` | `wrangler.jsonc`（root） | Next.jsフロントエンド（OpenNext） |
| `score-splitter-api` | `cloudflare/worker/wrangler.jsonc` | Worker API + D1 |

## カスタムドメイン（yamawake.app）

Cloudflare Custom Domains（各 `wrangler.jsonc` の `routes` + `custom_domain: true`）で割り当てる。ゾーンが同一アカウントにあるため、deploy時にDNSレコードが自動作成される（対象ホストに既存レコードがあるとdeployが失敗するので事前に空にしておく）。

| ホスト | 割当先Worker | 内容 |
|--------|-------------|------|
| `yamawake.app` | `score-splitter-web` | ウェイトリストLP（`/` を `/lp` へrewrite） |
| `app.yamawake.app` | `score-splitter-web` | アプリ本体 |
| `api.yamawake.app` | `score-splitter-api` | Worker API |
| `www.yamawake.app` | （Workerなし） | ゾーンのRedirect Ruleで `yamawake.app` へ301 |

- LP/アプリの出し分けは `src/middleware.ts` のホスト判定で行う。apexのアプリ系パスは `app.yamawake.app` へ307、`/lp` の正規URLは `https://yamawake.app/` に一本化（308）。localhost / workers.dev / preview URLは従来挙動
- ホストを跨ぐのはredirectのみ（rewriteは同一ホスト内）なので、Server Actionsの `experimental.serverActions.allowedOrigins` は不要。将来ホスト跨ぎrewriteを導入する場合のみ設定が必要
- `NEXT_PUBLIC_SITE_URL`（LPの `metadataBase` 用）はLPが静的プリレンダリングされるためビルド時に必要。Workers Builds（score-splitter-web）のビルド変数にも `https://yamawake.app` を設定すること
- www用のDNS（`www` をProxiedでCNAME → `yamawake.app`）とRedirect Rule（`www.yamawake.app/*` → `https://yamawake.app/$1`、301）はダッシュボードで手動設定
- 旧 `https://<worker名>.<account-subdomain>.workers.dev` は切り戻し先として当面併存させ、安定稼働確認後に `workers_dev: false` へ変更する（`preview_urls` は独立設定のため据え置き）。API側のworkers.dev URLはフロントの `CLOUDFLARE_WORKER_API_URL` 切替前に無効化しないこと

## Workers Builds（Git連携）の設定値

Cloudflareダッシュボード → Workers & Pages で、同一リポジトリに対して2プロジェクトを設定する。

| 項目 | score-splitter-web（フロント） | score-splitter-api（API） |
|------|------------------------------|--------------------------|
| Root directory | `/` | `/` |
| Build command | `npx opennextjs-cloudflare build` | （空欄。wranglerがdeploy時にバンドル） |
| Deploy command | `npx opennextjs-cloudflare deploy` | `npm run deploy:worker` |
| Build watch paths（任意） | `src/**` `public/**` | `cloudflare/worker/**` |

**注意**: API側のDeploy commandは必ず `--config cloudflare/worker/wrangler.jsonc` を明示すること。省略するとrootの `wrangler.jsonc`（フロント用）を読んでしまい、フロントを二重デプロイする事故になる。

## シークレット設定

非シークレット変数（URL・WebAuthn RP設定）は root `wrangler.jsonc` の `vars` で管理。シークレットは以下で設定する:

```bash
# フロントエンド（score-splitter-web）
npx wrangler secret put CLOUDFLARE_WORKER_API_TOKEN
npx wrangler secret put APP_PASSWORD_HASH_BASE64
npx wrangler secret put OPENAI_API_KEY

# API（score-splitter-api）
npx wrangler secret put WORKER_API_TOKEN --config cloudflare/worker/wrangler.jsonc
```

`CLOUDFLARE_WORKER_API_TOKEN` と `WORKER_API_TOKEN` は同じ値（フロント→APIの共有Bearerトークン）。

## AI診断リリース手順

staging、productionの順で、必ず次の順序を守る。旧Workerと互換なadditive migrationを先行適用し、API Worker、フロントエンドの順に公開する。`deploy:worker`はremote migrationが失敗すると`&&`で停止し、Workerをdeployしない。

1. 対象環境のD1 migration一覧を確認し、意図しないpendingがないことを確認する。
2. `npm run migrate:worker:remote`で0001〜最新migrationを適用する。
3. migration一覧を再確認し、pending 0件であることを確認する。
4. root frontend Workerに`OPENAI_API_KEY`、`CLOUDFLARE_WORKER_API_TOKEN`、`APP_PASSWORD_HASH_BASE64`が存在し、API Workerに`WORKER_API_TOKEN`が存在することを確認する。値は出力しない。
5. `npm run deploy:worker`でmigration gateを再確認してAPI Workerをdeployする。
6. `npm run deploy`でフロントエンドをdeployする。

環境別確認コマンドでは、staging用のconfig/databaseを明示する。production用の上記既定configをstagingへ流用しない。

### staging / production smoke checklist

- migration statusがpending 0件で、`ai_diagnoses`、`ai_execution_guard`、`ai_diagnosis_source_revision`を参照できる。
- 通常の支出更新（label、amount、繰越切替）が成功し、一覧へ反映される。
- AI診断のcontext取得、lease取得、カテゴリ分類、診断保存が成功する。
- 診断実行中に通常の支出更新を行うと、古い診断保存は409になり、画面の既存結果はstale表示になる。
- AI診断成功後、通常の支出更新と再診断が引き続き成功する。

stagingの全項目に合格してからproductionへ進み、productionでも同じchecklistを実施する。API secretや実OpenAI呼び出しが必要なsmokeは権限を持つ運用担当者が実施する。

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
