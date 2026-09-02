# デプロイ

Next.js/OpenNextのroot Worker 1つをCloudflare Workersにホストする。通常のデータアクセスはWorkerのD1 bindingへの直接アクセスで、公開HTTP API Workerは使用しない。デプロイはWorkers Builds（Git連携）による自動デプロイを基本とする。

## 構成

| Worker | 設定ファイル | 内容 |
|--------|------------|------|
| `score-splitter-web` | `wrangler.jsonc`（root） | 本番のNext.js/OpenNext + 本番D1 `score-splitter` |
| `score-splitter-dev` | `wrangler.jsonc` の `env.dev` | 開発・PR PreviewのNext.js/OpenNext + 開発D1 `score-splitter-db-dev` |
| `score-splitter-api` | `cloudflare/worker/wrangler.jsonc` + `src/index.ts` | 旧HTTP入口。D1ドメイン関数は共有し、安定確認まで切り戻し用に保持 |

## カスタムドメイン（yamawake.app）

Cloudflare Custom Domains（各 `wrangler.jsonc` の `routes` + `custom_domain: true`）で割り当てる。ゾーンが同一アカウントにあるため、deploy時にDNSレコードが自動作成される（対象ホストに既存レコードがあるとdeployが失敗するので事前に空にしておく）。

| ホスト | 割当先Worker | 内容 |
|--------|-------------|------|
| `yamawake.app` | `score-splitter-web` | ウェイトリストLP（`/` を `/lp` へrewrite） |
| `app.yamawake.app` | `score-splitter-web` | アプリ本体 |
| `api.yamawake.app` | `score-splitter-api` | 旧HTTP API（rollback-only） |
| `www.yamawake.app` | （Workerなし） | ゾーンのRedirect Ruleで `yamawake.app` へ301 |

- LP/アプリの出し分けは `src/middleware.ts` のホスト判定で行う。apexのアプリ系パスは `app.yamawake.app` へ307、`/lp` の正規URLは `https://yamawake.app/` に一本化（308）。localhost / workers.dev / preview URLは従来挙動
- ホストを跨ぐのはredirectのみ（rewriteは同一ホスト内）なので、Server Actionsの `experimental.serverActions.allowedOrigins` は不要。将来ホスト跨ぎrewriteを導入する場合のみ設定が必要
- `NEXT_PUBLIC_SITE_URL`（LPの `metadataBase` 用）はLPが静的プリレンダリングされるためビルド時に必要。Workers Builds（score-splitter-web）のビルド変数にも `https://yamawake.app` を設定すること
- www用のDNS（`www` をProxiedでCNAME → `yamawake.app`）とRedirect Rule（`www.yamawake.app/*` → `https://yamawake.app/$1`、301）はダッシュボードで手動設定
- 旧 `score-splitter-api` とそのworkers.dev URLは、一本化後の障害時の切り戻し判断が終わるまで保持する。通常リクエストは旧APIへ送らない

## Workers Builds（Git連携）の設定値

Cloudflareダッシュボード → Workers & Pagesでは、本番と開発を同じGitHubリポジトリに接続した別プロジェクトとして設定する。実行時のWorkerは本番・開発それぞれ1つであり、API Worker用のWorkers Buildsプロジェクトは作成しない。

| 項目 | score-splitter-web（本番） | score-splitter-dev（開発・PR Preview） |
|------|---------------------------|--------------------------------------|
| Build command（all branches） | `npx opennextjs-cloudflare build` | `npx opennextjs-cloudflare build --env dev` |
| Deploy command（production） | `npx opennextjs-cloudflare deploy` | `npx opennextjs-cloudflare deploy --env dev` |
| Non-production branch deploy command | 設定しない | `npx opennextjs-cloudflare upload --env dev` |

GitHubへpushするとWorkers Buildsが自動実行され、devプロジェクトのPRごとにBranch Alias Preview URLが発行される。PRコメントのBranch Aliasを動作確認に使う。Previewは `score-splitter-db-dev` を共有し、固定の `dev.yamawake.app` は作成しない。パスワードログインと主要な家計操作を確認するが、パスキーUIが表示される場合でも、Preview URLではWebAuthnのRP設定が一致しないため未対応とし、パスキー操作は行わない。

`npm run upload:dev` はGitHub push時の自動PR Previewとは別の手動確認用コマンドで、ローカルの作業内容をVersionとしてuploadし、そのVersion Preview URLで確認する。手動uploadのVersion Preview URLをPRのBranch Alias Preview URLと混同しない。

両プロジェクトともcustom watch pathsは設定しない。設定を変更した場合も、リポジトリ全体をビルド対象とする。これにより `src/**`、`public/**`、`cloudflare/worker/src/**`、`cloudflare/worker/migrations/**`、`package.json`、lockfile、`wrangler.jsonc` などの変更を監視漏れにしない。

## シークレット設定

非シークレット変数（URL・WebAuthn RP設定）は root `wrangler.jsonc` の `vars` で管理。シークレットは以下で設定する:

```bash
# 本番Worker（score-splitter-web）
npx wrangler secret put APP_PASSWORD_HASH_BASE64

# 開発Worker（score-splitter-dev）。値はGitに保存しない
npx wrangler secret put APP_PASSWORD_HASH_BASE64 --env dev
```

旧API Workerの共有シークレットは切り戻しが必要な期間だけ保持し、新しい通常経路の設定として追加しない。

## 手動デプロイ

```bash
npm run deploy         # フロントエンド（OpenNextビルド + deploy）
npm run deploy:dev     # 開発Worker（OpenNextビルド + env.dev deploy）
npm run upload:dev     # 手動のVersion Previewへupload（env.dev）
npm run migrate:dev    # 開発D1へmigrationを適用
npm run backup:d1:production -- --confirm-production-d1 <本番D1 UUID> # 本番切替前のバックアップ検証
npm run preview        # フロントエンドをworkerd上でローカル実行（.dev.varsが必要）
```

### 本番バックアップとPRゲート

本番D1 `score-splitter` には失ってはいけないデータがあるため、本番binding変更や本番デプロイの前に必ずバックアップを取得する。scriptは本番D1 UUIDを照合し、Time Travel bookmark、全量SQL、SHA-256、SQLiteへの一時復元、integrity_check、全8テーブルの件数一致を確認して、Git管理外の `/Users/aa00037-tanaka/Documents/Backups/score-splitter/d1/` にPASS manifestを保存する。

本番PRは最初からDraftで作成し、Preview確認とバックアップscriptのPASS、ユーザーの明示承認が揃うまでReady for reviewへの変更・merge・本番デプロイを禁止する。Time Travel restoreは自動実行せず、データ破損時にユーザーが明示承認した場合だけ実施する。

### 旧APIへの切り戻し

一本化後のroot Workerで障害が発生した場合は、まず `score-splitter-web` を問題発生前のVersionへ戻す。対象Versionは事前に `npx wrangler deployments list --name score-splitter-web --json` で確認し、バックアップPASSとユーザーの明示承認後に次を実行する。

```bash
npx wrangler rollback <旧Version ID> --name score-splitter-web
```

旧HTTP APIへ切り戻す必要がある場合の前提は、`api.yamawake.app` のCustom Domain routeが `score-splitter-api` に残っていること、`cloudflare/worker/wrangler.jsonc` が本番D1 `score-splitter`を指すこと、API側secret `WORKER_API_TOKEN` とroot側secret `CLOUDFLARE_WORKER_API_TOKEN` が同じBearer値であること。旧API Workerを再デプロイする場合は次を使う。

```bash
npx wrangler secret put WORKER_API_TOKEN --config cloudflare/worker/wrangler.jsonc
npx wrangler secret put CLOUDFLARE_WORKER_API_TOKEN
npx wrangler deploy --config cloudflare/worker/wrangler.jsonc
```

旧API経路を使う旧root Versionへ戻した後だけ、rootのrollback-only変数 `CLOUDFLARE_WORKER_API_URL=https://api.yamawake.app` とBearer secretが有効になる。復旧後はroot Workerを最新Versionへ戻し、旧APIの再デプロイ・secret変更が必要だった場合は履歴へ記録する。D1 restoreは別操作であり、自動で行わない。

## ドメイン変更時のパスキー再登録

WebAuthnのパスキーはRP ID（ドメイン）に紐づくため、ホスティングドメインが変わると既存パスキーは無効になる。パスワードでログインし直し、`/settings` からパスキーを再登録する。旧ドメインのパスキーはD1の `passkey_credentials` に残るが認証にはマッチしないため無害（気になる場合は設定画面から削除）。

## Vercelからの移行メモ（2026-07）

- フロントエンドはVercelホスティングから本構成（OpenNext + Workers Builds）へ移行済み
- Vercel廃止手順: Git連携を解除 → Cloudflare側の安定稼働を確認 → Vercelプロジェクトを削除
- Vercelに旧Worker APIトークンを設定していた場合は、旧APIの安定確認・廃止時に `WORKER_API_TOKEN` / `CLOUDFLARE_WORKER_API_TOKEN` をローテーションまたは削除する
