# テスト構成

## 概要

3層のテスト体制を採用しています。

| 層 | ツール | 目的 |
|---|-------|------|
| ユニットテスト | Vitest | 関数・ロジックの単体テスト |
| 統合テスト | Vitest | Server Actions のテスト |
| E2Eテスト | Playwright | ブラウザでの動作テスト |

## ディレクトリ構造

```
tests/
├── unit/                     # ユニットテスト
│   ├── calculation.test.ts   # 計算ロジック
│   ├── format.test.ts        # フォーマット関数
│   └── validations/          # バリデーション
│       ├── income.test.ts
│       ├── expense.test.ts
│       └── carryover.test.ts
│
├── integration/              # 統合テスト
│   └── actions/
│       ├── auth.test.ts      # 認証
│       ├── income.test.ts    # 収入CRUD
│       ├── expense.test.ts   # 支出CRUD
│       ├── carryover.test.ts # 繰越CRUD
│       └── copy-month.test.ts # 月コピー
│
├── components/               # コンポーネントテスト
│   └── sections/
│       └── *.test.tsx
│
├── e2e/                      # E2Eテスト
│   └── *.spec.ts
│
├── mocks/                    # モック・フィクスチャ
│   └── *.ts
│
└── setup.ts                  # テストセットアップ
```

## テストコマンド

```bash
# Vitestウォッチモード（開発時）
npm test

# Vitestシングルラン
npm run test:run

# カバレッジ付きテスト
npm run test:coverage

# E2Eテスト
npm run test:e2e

# E2Eテスト（UIモード）
npm run test:e2e:ui
```

## ユニットテスト

### 計算ロジックのテスト

`tests/unit/calculation.test.ts`

テスト項目（11テスト）：
- 収入合計の計算
- 支出合計の計算
- お小遣いの計算
- 精算額の計算
- 夫から妻への精算
- 妻から夫への精算
- 精算不要のケース
- 端数処理

### フォーマット関数のテスト

`tests/unit/format.test.ts`

- 日付フォーマット
- 金額フォーマット（カンマ区切り）

### バリデーションのテスト

`tests/unit/validations/`

- 収入スキーマのバリデーション
- 支出スキーマのバリデーション
- 繰越スキーマのバリデーション

## 統合テスト

Server Actions の動作をテストします。

### 認証テスト

`tests/integration/actions/auth.test.ts`

- ログイン成功
- ログイン失敗（パスワード不一致）
- ログアウト
- 認証状態確認

### CRUDテスト

各データ種別（収入/支出/繰越）に対して：

- 新規作成
- 一覧取得
- 更新
- 削除
- バリデーションエラー

### 月コピーテスト

`tests/integration/actions/copy-month.test.ts`

- addモードでのコピー
- skipモードでのコピー
- replaceモードでのコピー
- 金額付きコピー
- 項目名のみコピー

### AI家計診断テスト

- 異なる月を含む世帯全体の同時実行1件、5秒cooldown、UTC日次20回
- 409/429と`Retry-After`、モックresetによるguard分離
- 分類入力100/101種類、安定順、超過`other`、provider/OpenAI request上限
- 月lease・世帯全体guardのtoken/期限fencingと既分類を上書きしないcompare-and-set
- 分類保存後に再取得したD1 contextと診断入力指紋の一致
- WorkerとMSWのrequest/status/body契約一致

## E2Eテスト

Playwrightによるブラウザテスト。

### 設定

```typescript
// playwright.config.ts
{
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev:mock',
  },
  projects: [
    { name: 'chromium' }
  ]
}
```

## テスト環境

### Vitest設定

```typescript
// vitest.config.ts
{
  environment: 'jsdom',
  globals: true,
  setupFiles: ['tests/setup.ts'],
  include: ['tests/**/*.test.ts(x)'],
  coverage: {
    include: ['src/**/*.ts(x)'],
    exclude: ['src/components/ui/**']
  }
}
```

### セットアップファイル

`tests/setup.ts`

- `@testing-library/jest-dom` のマッチャー拡張
- グローバルモックの設定

## モック

`tests/mocks/`

- Worker APIクライアントのモック
- 認証関数のモック
- テストデータ（フィクスチャ）

## 振込状況

- `npm run test:run -- tests/unit/payment-status.test.ts tests/unit/cloudflare/payment-store.test.ts tests/unit/cloudflare/payment-status-domain.test.ts tests/integration/actions/payment-status.test.ts tests/components/features/payment-status.test.tsx`: 計算・履歴・認証・操作UI。
- `npm run test:d1:payment`: 全migrationを一時Miniflare D1に適用し、実共有関数の再送・競合・履歴不変・途中rollback・編集継続を検証。外部DBへ接続せず通常Unitから分離。
- `npx playwright test tests/e2e/payment-status.spec.ts`: 振込→編集→差額登録→取消／訂正。375px/1280px、ライト/ダークの状態別スクリーンショット。
- `.github/workflows/payment-d1.yml`: 関連ファイル変更時とnightlyに専用D1 Jobを実行。


## 世帯の互換移行

- `npm run test:run -- tests/unit/cloudflare/household-migrations.test.ts tests/unit/scripts/backup-schema.test.ts`: SQLiteで0009の旧SQL互換、0010の全保持列/JSON・revision・quota不変、不正所属の拒否を検証。
- `npm run test:d1:household-migrations`: 一時設定とローカルWrangler D1で、0010の途中失敗によるデータ・DDL・trigger・適用台帳のrollback、正規SQL再適用、immutable/FK保護を確認。remoteへ接続しない。
- 実D1検証は通常Unitから独立。Node 22のSQLite標準モジュールがExperimentalWarningを出す場合がある。失敗を無視する設定は使わない。
- 最終0011/0012と全経路の2世帯検証は後続タスク。互換移行の成功だけを世帯分離完成の証拠にしない。
