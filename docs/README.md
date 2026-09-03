# ヤマワケ（家計精算アプリ）

ふたりの家計を公平に管理・精算するためのWebアプリケーションです。

## 概要

毎月の収入・支出・繰越を記録し、残ったお金をふたりで山分けするための精算金額を自動計算します。

本番・開発とも、Next.js/OpenNextの1つのWorkerからCloudflare D1へ直接アクセスします。開発Workerは `score-splitter-dev`、開発D1は `score-splitter-db-dev` です。PRごとの確認は固定ドメインではなくWorkers BuildsのブランチPreview URLを使います。D1のドメイン関数は `cloudflare/worker/src/` と共有し、同ディレクトリの `index.ts`（HTTP入口）だけを旧APIの切り戻し用に保持します。

## 主な機能

- **収入・支出・繰越の管理**: 月単位でのデータ入力・編集・削除
- **担当者別管理**: 夫/妻それぞれの収支を分けて管理
- **自動精算計算**: 公平な精算金額を自動計算
- **月データコピー**: 前月のデータを当月にコピー可能

## ドキュメント構成

| ファイル | 内容 |
|---------|------|
| [architecture.md](./architecture.md) | ディレクトリ構造・アーキテクチャ |
| [tech-stack.md](./tech-stack.md) | 使用技術スタック |
| [components.md](./components.md) | コンポーネント構造 |
| [features.md](./features.md) | 主要機能の詳細 |
| [database.md](./database.md) | データベース設計 |
| [testing.md](./testing.md) | テスト構成 |
| [configuration.md](./configuration.md) | 設定ファイル |

## クイックスタート

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# モック付きUI/E2E（旧HTTP API経路はUSE_MOCKS=trueのときだけ使用）
npm run dev:mock

# テストの実行
npm test

# E2Eテストの実行
npm run test:e2e
```

Cloudflare上の開発D1を使う場合は `npm run migrate:dev` でmigrationを適用します。GitHubへpushするとWorkers Buildsが自動実行され、PRにはdev WorkerのBranch Alias Preview URLが発行されます。PR Previewの確認はこのBranch Alias URLを使います。手動で確認したい場合だけ `npm run upload:dev` を実行し、発行されたVersion Preview URLを使います。両者は別のURLです。Previewではパスワードログインを確認し、パスキーは対象外です。

## 環境変数

`.env.local` ファイルに以下の環境変数を設定してください：

```
APP_PASSWORD_HASH_BASE64=your_password_hash_base64
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_ORIGIN=http://localhost:3000
WEBAUTHN_RP_NAME=ヤマワケ
```

`CLOUDFLARE_WORKER_API_URL` とAPI共有トークンは通常経路では不要です。`USE_MOCKS=true` のモックテストだけ旧HTTP/MSW互換のために使用します。

本番ではアプリ側のログイン試行制限に加えて、Cloudflare WAF / Rate Limiting Rules の併用を推奨します。
