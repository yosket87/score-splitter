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
    command: 'npm run dev',
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
