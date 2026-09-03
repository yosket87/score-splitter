# アーキテクチャ・ディレクトリ構造

## ディレクトリ構造

```
score-splitter/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── actions/              # Server Actions
│   │   │   ├── auth.ts           # 認証処理
│   │   │   ├── income.ts         # 収入CRUD
│   │   │   ├── expense.ts        # 支出CRUD
│   │   │   ├── carryover.ts      # 繰越CRUD
│   │   │   ├── copy-month.ts     # 月コピー機能
│   │   │   ├── monthly-summary.ts # 月次集計
│   │   │   ├── passkeys.ts       # パスキー認証
│   │   │   └── waitlist.ts       # ウェイトリスト登録
│   │   ├── login/                # ログインページ
│   │   ├── layout.tsx            # ルートレイアウト
│   │   ├── page.tsx              # ホームページ
│   │   └── globals.css           # グローバルスタイル
│   │
│   ├── components/
│   │   ├── entry-fields.tsx      # 収入/支出/繰越フォーム共通フィールド
│   │   ├── entry-section.tsx     # 収入/支出/繰越セクション共通UI
│   │   ├── layout/               # レイアウトコンポーネント
│   │   │   └── header.tsx
│   │   └── ui/                   # UIコンポーネント（shadcn/ui）
│   │
│   ├── features/                 # ドメイン機能
│   │   ├── income/               # 収入セクション
│   │   ├── expense/              # 支出セクション
│   │   ├── carryover/            # 繰越セクション
│   │   ├── add-entry/            # エントリ追加
│   │   ├── edit-entry/           # エントリ編集
│   │   ├── copy-month/           # 月コピー機能
│   │   ├── monthly-overview/     # 月次精算額の概要
│   │   ├── monthly-list/         # 年別の月一覧
│   │   ├── export-csv/           # CSVエクスポート
│   │   ├── passkey/              # パスキー設定・ログイン
│   │   └── waitlist-lp/          # 需要検証用LP
│   │
│   ├── lib/
│   │   ├── api/                  # D1直接アクセスのアダプター
│   │   │   ├── client.ts         # 旧HTTPクライアント（USE_MOCKS/切り戻し用）
│   │   │   ├── records.ts        # 収支データAPI
│   │   │   ├── sessions.ts       # セッションAPI
│   │   │   ├── passkeys.ts       # パスキーAPI
│   │   │   ├── copy-month.ts     # 月コピーAPI
│   │   │   ├── monthly-summary.ts # 月次集計API
│   │   │   └── login-attempts.ts # ログイン試行API
│   │   ├── utils/                # ユーティリティ
│   │   │   ├── calculation.ts    # 計算ロジック
│   │   │   └── format.ts         # フォーマット関数
│   │   └── validations/          # バリデーション
│   │       ├── income.ts
│   │       ├── expense.ts
│   │       └── carryover.ts
│   │
│   ├── types/
│   │   └── index.ts              # 型定義
│   │
│   └── middleware.ts             # 認証ミドルウェア
│
├── tests/
│   ├── unit/                     # ユニットテスト
│   ├── integration/              # 統合テスト
│   ├── components/               # コンポーネントテスト
│   ├── e2e/                      # E2Eテスト
│   ├── mocks/                    # モック・フィクスチャ
│   └── setup.ts                  # テストセットアップ
│
├── cloudflare/
│   └── worker/                   # D1ドメイン関数・migration。HTTP入口は切り戻し用
│       ├── src/                  # root Workerと共有するD1ドメイン関数
│       │   └── index.ts          # 旧APIのHTTP入口（切り戻し用）
│       └── migrations/           # D1マイグレーション
│
├── public/                       # 静的アセット
│
└── 設定ファイル群
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── vitest.config.ts
    ├── playwright.config.ts
    ├── eslint.config.mjs
    ├── postcss.config.mjs
    └── components.json
```

## アーキテクチャパターン

### Server Components + Server Actions

Next.js 16のApp Routerを使用し、Server ComponentsとServer Actionsを中心としたアーキテクチャを採用しています。

```
[クライアント] ─→ [Server Component] ─→ [Server Action] ─→ [OpenNext Worker]
                                                        └─→ [D1 binding]
```

本番・開発の通常経路は、rootのNext.js/OpenNext WorkerからD1 bindingへ直接アクセスする。`src/lib/api/` はドメイン別のデータ操作インターフェースを維持し、D1ドメイン関数は `cloudflare/worker/src/` と共有する。`USE_MOCKS=true` の場合だけ既存のHTTPクライアントとMSW経路へ切り替える。旧APIのHTTP入口（`cloudflare/worker/src/index.ts`）と設定は切り戻し用に安定稼働確認まで残す。

### レイヤー構成

1. **プレゼンテーション層**: `components/`
   - UI表示とユーザーインタラクション

2. **アプリケーション層**: `app/actions/`
   - ビジネスロジックとデータ操作

3. **ドメイン層**: `lib/utils/`, `lib/validations/`
   - 計算ロジック、バリデーション

4. **インフラ層**: `lib/api/`, `cloudflare/worker/`
   - D1 binding経由のデータアクセス、共有D1ドメイン関数、認証補助。旧HTTP API入口はモック・切り戻し用

### 認証フロー

```
リクエスト
    ↓
middleware.ts（認証チェック）
    ↓
├── 認証済み → ページ表示
└── 未認証 → /login へリダイレクト
```
