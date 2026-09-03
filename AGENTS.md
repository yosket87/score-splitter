# AGENTS.md

このファイルはCodexがプロジェクトを理解するためのガイドです。

## プロジェクト概要

夫婦間の家計を管理・精算するWebアプリケーション。毎月の収入・支出・繰越を記録し、精算金額を自動計算する。

詳細: [docs/README.md](docs/README.md)

## よく使うコマンド

```bash
# 開発
npm run dev          # 開発サーバー起動 (localhost:3000)
npm run build        # 本番ビルド
npm run lint         # ESLint実行

# デプロイ (Cloudflare Workers)
npm run preview      # workerd上でローカル実行 (要 .dev.vars、localhost:8787)
npm run deploy       # 本番 Worker (score-splitter) をデプロイ
npm run deploy:dev   # 開発 Worker (score-splitter-dev) をデプロイ
npm run upload:dev   # 手動のVersion Previewへupload（PR Previewはpushで自動実行）
npm run migrate:dev  # 開発D1へmigrationを適用
npm run backup:d1:production -- --confirm-production-d1 <本番D1 UUID> # 本番切替前のバックアップ検証
npm run cf-typegen   # wrangler.jsonc の vars 変更後に環境変数型を再生成

# テスト
npm run test         # Vitestウォッチモード
npm run test:run     # 単発実行
npm run test:coverage # カバレッジ測定
npm run test:e2e     # Playwright E2Eテスト
npm run test:e2e:ui  # Playwright UIモード
```

## ディレクトリ構成

```
src/
├── app/actions/     # Server Actions (認証、CRUD)
├── features/        # ドメイン機能 (Recursive Features Structure)
│   ├── income/      # 収入セクション
│   ├── expense/     # 支出セクション
│   ├── carryover/   # 繰越セクション
│   ├── add-entry/   # エントリ追加 (FAB + Sheet + Modal + Form)
│   ├── edit-entry/  # エントリ編集モーダル
│   ├── monthly-overview/ # ヒーロー（精算額表示）
│   ├── monthly-list/    # 月一覧
│   ├── copy-month/  # 月コピーダイアログ
│   ├── export-csv/  # CSVエクスポート
│   ├── passkey/     # パスキー登録・ログイン
│   └── waitlist-lp/ # 需要検証用ウェイトリストLP (/lp、認証不要)
├── components/
│   ├── ui/          # shadcn/ui コンポーネント
│   ├── layout/      # レイアウトコンポーネント
│   ├── providers/   # プロバイダー
│   ├── charts/      # チャート
│   └── animations/  # アニメーション
├── hooks/           # カスタムフック
├── lib/
│   ├── api/         # D1直接アクセスのアダプター（USE_MOCKS時のみ旧HTTP/MSW）
│   ├── utils/       # ユーティリティ (計算、フォーマット)
│   └── validations/ # Zodスキーマ
└── types/           # 型定義
tests/
├── unit/            # ユニットテスト
├── integration/     # 統合テスト
├── components/      # コンポーネントテスト (sections, features, a11y)
└── e2e/             # E2Eテスト
```

詳細: [docs/architecture.md](docs/architecture.md)

## コーディング規約

### 技術スタック
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Cloudflare Workers + D1（フロントは @opennextjs/cloudflare でWorkersにホスト）
- Vitest + Playwright

### Cloudflare構成の注意
- 通常運用はroot `wrangler.jsonc` のNext.js/OpenNext Workerが、`DB` bindingでD1へ直接アクセスする一本構成。本番Workerは `score-splitter`、開発Workerはnamed environmentの `score-splitter-dev`
- `cloudflare/worker/src/` のD1ドメイン関数はroot Workerと共有する現行資産。`cloudflare/worker/src/index.ts` と `cloudflare/worker/wrangler.jsonc` のHTTP入口・Worker設定だけは、安定稼働確認まで旧APIの切り戻し用に保持する
- `process.env.*` はリクエストコンテキスト内（Server Actions/RSCの関数内）でのみ読み出す。モジュールトップレベルで読むとWorker実行時に `undefined` になる
- 詳細: [docs/deployment.md](docs/deployment.md)

詳細: [docs/tech-stack.md](docs/tech-stack.md)

### スタイルガイド

- **Server Components優先**: データフェッチはServer Componentsで行う
- **Server Actions**: フォーム送信・データ変更は `app/actions/` のServer Actionsを使用
- **バリデーション**: Zodスキーマを `lib/validations/` に定義
- **パスエイリアス**: `@/` で `src/` を参照
- **コミットメッセージ**: 日本語で記述、プレフィックス使用 (feat:, fix:, docs:, test:, chore:)

### 認証

- `src/middleware.ts` でセッションベース認証（`household_session` cookie）
- 未認証時は `/login` にリダイレクト

### 金額の扱い

- **収入**: 正の整数で保存
- **支出・繰越**: 負の整数で保存（入力時は正の値、保存時に負に変換）

### 担当者 (Person)

```typescript
type Person = 'husband' | 'wife'
```

## データベース

8つのテーブル: `incomes`, `expenses`, `carryovers`, `sessions`, `passkey_credentials`, `webauthn_challenges`, `login_attempts`, `waitlist_entries`

詳細: [docs/database.md](docs/database.md)

## テスト

- ユニットテスト: `tests/unit/` - 計算ロジック、バリデーション
- 統合テスト: `tests/integration/` - Server Actions
- E2Eテスト: `tests/e2e/` - ユーザーフロー

詳細: [docs/testing.md](docs/testing.md)

## UI検証ワークフロー

UIやフロントエンドの変更時は、必ず以下の手順でブラウザ上の表示を検証すること。

1. `npm run dev:mock` でモック付きdevサーバーを起動（MSWがWorker APIをモック）
2. Playwright MCPでブラウザを操作し、ログイン → 対象画面を表示（パスワード: `password`）
3. スクリーンショットを撮影し、表示崩れ・データ表示・操作性を目視確認
4. 正常系だけでなく、空データや境界値のケースも確認する

- モックデータ: `src/mocks/data.ts`
- MSWハンドラー: `src/mocks/handlers.ts`
- インメモリDB: `src/mocks/db.ts`
- 起動制御: `src/instrumentation.ts`（`USE_MOCKS=true` 時のみMSW起動）

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [docs/README.md](docs/README.md) | プロジェクト概要 |
| [docs/architecture.md](docs/architecture.md) | アーキテクチャ・構造 |
| [docs/tech-stack.md](docs/tech-stack.md) | 技術スタック |
| [docs/components.md](docs/components.md) | コンポーネント詳細 |
| [docs/features.md](docs/features.md) | 主要機能 |
| [docs/database.md](docs/database.md) | データベース設計 |
| [docs/testing.md](docs/testing.md) | テスト構成 |
| [docs/configuration.md](docs/configuration.md) | 設定ファイル |
| [docs/deployment.md](docs/deployment.md) | デプロイ構成・手順 |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
