# 技術スタック

## フロントエンド

| 技術 | バージョン | 用途 |
|-----|----------|------|
| Next.js | 16.2.10 | Reactフレームワーク |
| React | 19.2.3 | UIライブラリ |
| TypeScript | 5.x | 型安全な開発 |
| Tailwind CSS | 4.x | CSSフレームワーク |
| shadcn/ui | - | UIコンポーネントライブラリ |
| Radix UI | - | アクセシビリティ対応プリミティブ |
| Lucide React | - | アイコンライブラリ |

## フォーム・バリデーション

| 技術 | バージョン | 用途 |
|-----|----------|------|
| React Hook Form | 7.71.1 | フォーム状態管理 |
| Zod | 4.3.6 | スキーマバリデーション |
| @hookform/resolvers | 5.2.2 | RHF + Zod連携 |

## ホスティング・バックエンド

| 技術 | バージョン | 用途 |
|-----|----------|------|
| Cloudflare Workers | - | Next.js/OpenNext Workerのホスティング（本番・開発をnamed environmentで分離） |
| @opennextjs/cloudflare | 1.20.x | Next.jsをWorkers上で動かすアダプタ |
| Cloudflare D1 | - | SQLiteベースの永続データベース |
| Wrangler | 4.x | Cloudflare CLI（デプロイ・ローカル実行） |

本番・開発の通常リクエストは、Next.js/OpenNext WorkerのD1 bindingから `cloudflare/worker/src/` のD1ドメイン関数を呼び出す。`cloudflare/worker/src/index.ts` のHTTP入口とHTTPクライアントは、`USE_MOCKS=true` のMSWテストまたは旧APIへの切り戻し用に残す。

## 認証・セキュリティ

| 技術 | バージョン | 用途 |
|-----|----------|------|
| bcryptjs | 3.0.3 | パスワードハッシュ化 |
| Cookie | - | セッション管理 |

## UI補助

| 技術 | バージョン | 用途 |
|-----|----------|------|
| Sonner | 2.0.7 | トースト通知 |
| next-themes | 0.4.6 | テーマ管理 |
| class-variance-authority | 0.7.1 | 条件付きスタイル |
| clsx | - | クラス名結合 |
| tailwind-merge | - | Tailwindクラスのマージ |

## テスト

| 技術 | バージョン | 用途 |
|-----|----------|------|
| Vitest | 4.0.18 | ユニット・統合テスト |
| Playwright | 1.58.1 | E2Eテスト |
| @testing-library/react | 16.3.2 | コンポーネントテスト |
| @testing-library/jest-dom | 6.9.1 | DOMマッチャー |
| jsdom | 27.4.0 | DOM環境シミュレーション |
| @vitest/coverage-v8 | 4.0.18 | カバレッジ測定 |

## 開発ツール

| 技術 | バージョン | 用途 |
|-----|----------|------|
| ESLint | 9.x | コード品質チェック |
| eslint-config-next | - | Next.js推奨ESLint設定 |
| PostCSS | - | CSSトランスパイル |

## NPMスクリプト

```json
{
  "dev": "next dev",                    // 開発サーバー起動
  "build": "next build",                // プロダクションビルド
  "start": "next start",                // プロダクションサーバー起動
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",  // workerd上でローカル実行
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",    // フロントエンドをデプロイ
  "deploy:dev": "opennextjs-cloudflare build --env dev && opennextjs-cloudflare deploy --env dev",  // 開発Workerをデプロイ
  "upload:dev": "opennextjs-cloudflare build --env dev && opennextjs-cloudflare upload --env dev",  // 手動のVersion Previewへupload
  "migrate:dev": "wrangler d1 migrations apply score-splitter-db-dev --remote --env dev",  // 開発D1へmigration
  "backup:d1:production": "node scripts/backup-production-d1.mjs",  // 本番D1のバックアップと復元検証
  "cf-typegen": "wrangler types --env-interface CloudflareEnv --include-runtime=false cloudflare-env.d.ts",  // 環境変数の型生成
  "lint": "eslint",                     // ESLintチェック
  "test": "vitest",                     // Vitestウォッチモード
  "test:run": "vitest run",             // Vitestシングルラン
  "test:coverage": "vitest run --coverage",  // カバレッジ付きテスト
  "test:e2e": "playwright test",        // Playwright E2Eテスト
  "test:e2e:ui": "playwright test --ui" // Playwright UIモード
}
```

通常の本番・開発リクエストはWorkerからD1へ直接アクセスする。HTTP APIクライアントは `USE_MOCKS=true` のMSWテストと旧API切り戻し用にのみ残す。
