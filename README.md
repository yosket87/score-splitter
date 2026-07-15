# ヤマワケ

ふたりの家計を公平に管理・精算するためのWebアプリケーションです。

## 概要

毎月の収入・支出・繰越を記録し、残ったお金をふたりで山分けするための精算金額を自動計算します。

## 主な機能

- **収入・支出・繰越の管理** - 月単位でのデータ入力・編集・削除
- **担当者別管理** - 夫/妻それぞれの収支を分けて管理
- **自動精算計算** - 公平な精算金額を自動計算
- **月データコピー** - 前月のデータを当月にコピー可能

## 技術スタック

- **フレームワーク**: Next.js 16 + React 19 + TypeScript
- **スタイリング**: Tailwind CSS 4 + shadcn/ui
- **ホスティング**: Cloudflare Workers（フロントは @opennextjs/cloudflare）
- **データベース**: Cloudflare D1
- **API**: Cloudflare Workers
- **テスト**: Vitest + Playwright

## セットアップ

### 依存関係のインストール

```bash
npm install
```

### 環境変数の設定

`.env.local` ファイルを作成し、以下の環境変数を設定してください：

```
CLOUDFLARE_WORKER_API_URL=your_worker_api_url
CLOUDFLARE_WORKER_API_TOKEN=your_worker_api_token
APP_PASSWORD_HASH_BASE64=your_password_hash_base64
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_ORIGIN=http://localhost:3000
WEBAUTHN_RP_NAME=ヤマワケ
```

### 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開きます。

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run preview` | workerd上でローカル実行（要 `.dev.vars`） |
| `npm run deploy` | フロントエンドをCloudflare Workersへデプロイ |
| `npm run deploy:worker` | Worker APIをデプロイ |
| `npm run lint` | ESLint実行 |
| `npm run migrate:supabase-to-d1` | 旧データをD1投入SQLへ変換 |
| `npm run test` | テスト（ウォッチモード） |
| `npm run test:run` | テスト（単発実行） |
| `npm run test:coverage` | カバレッジ測定 |
| `npm run test:e2e` | E2Eテスト |

## Cloudflare

フロントエンド・APIともCloudflare Workersにホストしています。デプロイ構成は [docs/deployment.md](./docs/deployment.md) を参照してください。

D1スキーマとWorker APIは `cloudflare/worker/` にあります。旧データの移行手順は [docs/cloudflare-migration.md](./docs/cloudflare-migration.md) を参照してください。

## ドキュメント

詳細なドキュメントは [docs/](./docs/) ディレクトリを参照してください。

| ドキュメント | 内容 |
|-------------|------|
| [docs/README.md](./docs/README.md) | プロジェクト概要 |
| [docs/architecture.md](./docs/architecture.md) | ディレクトリ構造・アーキテクチャ |
| [docs/tech-stack.md](./docs/tech-stack.md) | 技術スタック詳細 |
| [docs/components.md](./docs/components.md) | コンポーネント構造 |
| [docs/features.md](./docs/features.md) | 主要機能の詳細 |
| [docs/database.md](./docs/database.md) | データベース設計 |
| [docs/cloudflare-migration.md](./docs/cloudflare-migration.md) | D1移行手順 |
| [docs/deployment.md](./docs/deployment.md) | デプロイ構成・手順 |
| [docs/testing.md](./docs/testing.md) | テスト構成 |
| [docs/configuration.md](./docs/configuration.md) | 設定ファイル |

## ライセンス

Private
