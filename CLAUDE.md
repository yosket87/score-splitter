# CLAUDE.md

このファイルはClaude Codeがプロジェクトを理解するためのガイドです。

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
npm run deploy       # フロントエンド (score-splitter-web) をデプロイ
npm run deploy:worker # Worker API (score-splitter-api) をデプロイ
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
│   └── export-csv/  # CSVエクスポート
├── components/
│   ├── ui/          # shadcn/ui コンポーネント
│   ├── layout/      # レイアウトコンポーネント
│   ├── providers/   # プロバイダー
│   ├── charts/      # チャート
│   └── animations/  # アニメーション
├── hooks/           # カスタムフック
├── lib/
│   ├── api/         # Cloudflare Worker APIクライアント
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
- wrangler設定は2ファイル: root `wrangler.jsonc`（フロント `score-splitter-web`）と `cloudflare/worker/wrangler.jsonc`（API `score-splitter-api`）
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

3つのテーブル: `incomes`, `expenses`, `carryovers`

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
