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


## 世帯の段階移行

- `npm run test:run -- tests/unit/cloudflare/household-migrations.test.ts tests/unit/scripts/backup-schema.test.ts`: SQLiteで0009の旧SQL互換、0010の全保持列/JSON・revision・quota不変、不正所属の拒否を検証。
- `npm run test:d1:household-migrations`: 一時設定とローカルWrangler D1で、0010/0011の途中失敗によるデータ・DDL・trigger・適用台帳のrollback、正規SQL再適用、immutable/FK保護を確認。0011は4故障点と旧NULL追記の最終補完も検証。remoteへ接続しない。
- 実D1検証は通常Unitから独立。Node 22のSQLite標準モジュールがExperimentalWarningを出す場合がある。失敗を無視する設定は使わない。
- `npm run test:d1:records`: 同額同キーの繰越共存、コピー元競合、繰越集合変更、skip/replaceとrevisionを含むrollback。
- `npm run test:d1:ai-payment`: 同月2世帯のAI lease/quota/revision、分類所有権、同operation IDの並列再送、snapshot、越境取消拒否とbatch rollback。
- `tests/integration/api/ai-payment-household-http.test.ts`: 実SQLを使うHTTP WorkerとMSWで、セッション検証・任意所属指定の無効性・越境拒否を共通に検証。
- 最終0012の保持・rollback・再適用、exportを別の隔離D1へ復元する検証を維持する。現在のAPIは0013を必要とするため、歴史DBの専用cloneだけを正規migrationで更新して共有関数の世帯境界を検証し、元DBのschema・全保存値が変わらないことを確認する。クライアントはA→B同月、遅延応答、旧pendingと同operation IDの所有者違いを検証済み。
- CIはlint/typecheck/coverage/buildを独立Job、実D1の各スクリプトを別matrixへ分離。段階PRでもtest/E2Eを起動し、関連変更とnightlyでD1を検証する。Worker共有関数をcoverageへ含め、80%閾値を維持する。[段階別の実行結果](household-verification.md)を参照する。


## Google認証

- `npm run test:google-oidc:worker`: 署名・issuer・audience・state・nonce・PKCEの実プロトコルをworkerdで検証。
- `npm run test:d1:auth`: 実migrationを適用した隔離D1で一度きりの移行、所属、失効、復旧、競合rollback、運営CLIの承認を検証。実Wranglerのremote query契約はloopbackの合成APIで確認する。
- `npm run test:google-auth:production`: OpenNext build後の実配布成果物で、形式上有効なダミーGoogle設定を与えて正規originの開始、Preview拒否、全モック入口の無効化、外部通信0を確認する。CIでは専用Jobを使う。
- `tests/e2e/google-auth.spec.ts`: development限定の疑似providerで実OIDC検証を通し、通常ログイン、確認待ち・承認・再ログイン、本人だけの全端末失効、復旧、取消・期限切れを検証する。既存のパスワード回帰も維持する。
- 画面の目視は長いメールアドレス・照合コード、375px幅、空月、確認dialogを含める。承認・停止の合成fixtureを実在世帯に適用しない。実Google設定と2人の本人確認は[段階リリース手順](google-auth-release-runbook.md)で別途記録する。

旧認証終了後のUI確認は、ローカルの`/api/mock/google/prepare`へ`legacy-disabled`シナリオを準備してGoogleでログインする。通常ログインとの併存、停止後Googleのみの導線、設定での旧管理終了、CRUD/CSV、空月・狭幅を確認する。停止・承認用の実D1試験は2人の合成fixtureを使い、実在世帯の停止操作は行わない。
