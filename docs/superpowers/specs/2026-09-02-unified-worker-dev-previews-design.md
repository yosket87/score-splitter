# Worker一本化とPRプレビュー開発環境 設計ドキュメント

- 日付: 2026-09-02
- ステータス: 承認済み
- 目的: Next.jsとD1アクセスを1つのCloudflare Workerへ統合し、PRごとに本番から隔離されたブランチプレビューで動作確認できるようにする

## 決定事項

| 項目 | 決定 |
|------|------|
| 開発Worker | `score-splitter-dev` の1つだけを作る |
| 開発D1 | 本番と分離した `score-splitter-db-dev` を作る |
| 開発URL | 固定Custom Domainは作らず、Workers BuildsのPRブランチPreview URLを使う |
| 開発データ | すべてのPRプレビューで同じ開発D1を共有する |
| パスキー | 可変Preview URLでは動作確認対象外。パスワードログインを使う |
| 本番バックアップ | 本番切替直前にTime Travel復元地点と全量SQLを保存し、チェックサムと復元テストを通す |
| 本番切替 | Web Workerへ本番D1を直接バインドしてから一本化版をデプロイする |
| ロールバック | 旧API Workerと共有Bearer設定を本番安定確認まで残す |

## 1. 現状と目標

現状の本番データフロー:

```text
ブラウザ
  → score-splitter-web（Next.js / OpenNext）
  → 公開HTTP + Bearerトークン
  → score-splitter-api
  → score-splitter（本番D1）
```

目標の本番データフロー:

```text
ブラウザ
  → score-splitter-web（Next.js / OpenNext）
      └→ DB binding
          → score-splitter（本番D1）
```

目標の開発データフロー:

```text
PRブランチPreview URL
  → score-splitter-dev のPreview Version
      └→ DB binding
          → score-splitter-db-dev（開発D1）
```

API Workerを開発用に複製しない。PRプレビューは一本化後の最終構成だけを検証する。

## 2. コード境界

### D1コンテキスト

`@opennextjs/cloudflare` の `getCloudflareContext()` を使い、リクエスト処理中に `env.DB` を取得する。モジュールトップレベルではCloudflareコンテキストを取得しない。

Cloudflare依存は専用のコンテキストモジュールへ閉じ込め、D1操作関数は引き続き `D1DatabaseLike` を引数に受け取る。これにより既存のFake D1テストを再利用できる。

### D1操作

以下の既存処理と挙動を維持する。

- 収入・支出・繰越のCRUDと金額符号規約
- 月別集計
- 月コピーの `add` / `skip` / `replace` と重複判定
- セッションの作成・期限・削除
- ログイン試行制限
- パスキーとWebAuthnチャレンジの保存形式
- ウェイトリストのhoneypotと重複メール成功偽装

初回移行では、既存の `cloudflare/worker/src/` にあるD1操作関数を再利用する。HTTP境界撤去とファイル再配置を同時に行わず、データ経路が安定してからサーバー専用ディレクトリへ整理する。

### Server Actions

Server Actionsの公開シグネチャ、Zod入力検証、認証、Cookie操作、キャッシュ再検証、ユーザー向け固定エラー文言を変更しない。HTTPクライアントだった内部呼び出しだけをD1直接アクセスへ置き換える。

`src/middleware.ts` はCookie形式だけを確認する軽量な一次判定のまま維持し、D1アクセスを追加しない。

## 3. 移行用データアクセスポート

初回リリースでは、既存の `src/lib/api/*` が提供する関数名を維持する。各関数は通常実行時にD1を直接呼び出す。

`USE_MOCKS=true` のときだけ既存のMSW HTTPモック経路を使用し、現在のPlaywright E2Eと `/api/mock/reset` を維持する。このHTTP経路はテスト専用であり、Cloudflare上の開発・本番Workerから外部API Workerを呼ばない。

本番安定確認後のクリーンアップで、`src/lib/api` の命名とMSW依存をD1リポジトリまたはテスト用データポートへ整理する。

## 4. Wrangler環境

root `wrangler.jsonc` のトップレベルは本番 `score-splitter-web` を表し、named environment `dev` は `score-splitter-dev` を表す。

両環境に同じbinding名 `DB` を定義する。

- 本番: `score-splitter` のD1 UUID
- dev: `score-splitter-db-dev` のD1 UUID

`vars` とD1 bindingsはWrangler named environmentへ継承されないため、`env.dev` に開発用の値を明示する。本番のD1 UUIDをdev環境へ設定しない。

一本化後はCloudflare上で以下を削除できる状態にするが、初回リリースではロールバック用に残す。

- `CLOUDFLARE_WORKER_API_URL`
- `CLOUDFLARE_WORKER_API_TOKEN`
- `WORKER_API_TOKEN`
- `global_fetch_strictly_public`

## 5. PRブランチプレビュー

`score-splitter-dev` を本番Workerとは別のWorkers BuildsプロジェクトとしてGitHubリポジトリへ接続する。

- Production branch build: dev Workerの基準Versionを更新する
- Non-production branch build: OpenNextの `upload --env dev` でVersionをアップロードする
- PRごとにCloudflareが発行するブランチAlias Preview URLをPRコメントから開く
- PRへ追加コミットした場合も同じブランチAliasが最新Versionを指す
- Preview Versionはすべて `score-splitter-db-dev` を参照する
- Preview URLは公開URLであるため、本番データや本番シークレットを割り当てない

複数PRが同じ開発D1を共有する点は許容する。テストデータの衝突を避ける必要が生じた場合は、世帯分離やPR別DBをこの変更へ追加せず、別設計として扱う。

## 6. WebAuthn

WorkersのブランチPreview URLはブランチごとにホスト名が変わる。現在のWebAuthn設定は固定RP IDと固定Originを前提とするため、PRプレビューではパスキー登録・パスキーログインを動作確認対象外とする。

- PRプレビューのログインはパスワードを使う
- 可変ホストからRP IDやOriginを動的生成しない
- 本番の `WEBAUTHN_RP_ID=yamawake.app` と `WEBAUTHN_RP_ORIGIN=https://app.yamawake.app` は変更しない
- パスキーのユニット・統合テストは維持する

## 7. D1とマイグレーション

- 開発D1は `score-splitter-db-dev` として新規作成する
- `cloudflare/worker/migrations/0001` から `0004` を順番に適用する
- 既存migrationファイルは変更しない
- 本番データ、セッション、パスキー、ウェイトリスト情報を開発D1へコピーしない
- migration実行時はDB名、`--env dev`、`--remote` を明示し、本番への誤適用を防ぐ

マイグレーションはWorkerのビルド・デプロイへ自動連結しない。対象DBを確認できる独立した操作として実行する。

### 本番D1バックアップ

本番D1へ影響する操作と本番一本化デプロイの前に、次のバックアップゲートを必ず通す。

1. `wrangler d1 info` でDB名 `score-splitter` とUUID `7f8d3531-a833-4474-84d5-cee3ac98ee96` の一致を確認する
2. D1 Time Travelの現在の復元地点と生成されたrestoreコマンドを記録する
3. schemaとdataを含む全量SQLを `/Users/aa00037-tanaka/Documents/Backups/score-splitter/d1/<UTC日時>/` へエクスポートする
4. SQLファイルのSHA-256チェックサム、ファイルサイズ、主要8テーブルの件数をmanifestへ記録する
5. SQLを一時ローカルSQLiteへ投入し、構文と主要8テーブルの件数がmanifestと一致することを確認する
6. バックアップディレクトリを所有者だけが参照できる権限にする

SQLとmanifestには本番データまたは復元情報が含まれるためGitへ追加しない。バックアップ先は一時ディレクトリやこのworktree配下にせず、ブランチ作業終了後も残る永続パスを使う。

SQLエクスポート中は本番D1への他のリクエストが一時的にブロックされる可能性があるため、PRプレビュー確認後、本番切替直前の低利用時間帯に実施する。Time Travelのrestoreは破壊的操作として扱い、障害時にもユーザーの明示承認なしでは実行しない。

## 8. エラー処理とセキュリティ

- D1例外をブラウザへ露出せず、既存の固定ユーザー向けエラーへ変換する
- 入力検証と金額符号検証をD1直接化後も維持する
- レート制限チェックはパスワード照合より前に行う
- ウェイトリストは未認証のまま維持し、honeypotと重複成功偽装を残す
- Preview環境へ本番シークレットを設定しない
- Preview URLを非公開にする必要が生じた場合はCloudflare Accessを別途導入する

## 9. テスト

プロジェクト規約のRED → GREEN → REFACTORを各移行単位で実施し、カバレッジ80%以上を維持する。

### 維持するテスト

- Server Actionsの入力検証、認証、符号変換、再検証、固定エラー文言
- D1操作のSQL、行マッピング、月コピー、セッション、レート制限、パスキー、waitlist
- `npm run dev:mock` を使うPlaywright E2E
- middlewareのホストルーティングとCookie形式チェック

### 追加・変更するテスト

- D1コンテキストから `DB` bindingを取得して各データ操作へ渡すこと
- 通常環境ではHTTP fetchを使わずD1を呼ぶこと
- `USE_MOCKS=true` のときだけ既存MSW経路を使うこと
- D1例外時に既存のユーザー向けエラーへ変換されること
- root Wrangler設定で本番D1とdev D1が分離されていること
- パスキー以外の主要フローをPRプレビュー上で手動確認すること

### 最終検証

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:coverage
npm run build
npm run test:e2e
npm run preview
```

## 10. デプロイとロールバック

1. ローカルでD1直接化を実装し、全テストを通す
2. 開発D1を作成してmigrationを適用する
3. `score-splitter-dev` を作成し、一本化版をデプロイする
4. Workers Buildsの非本番ブランチを有効にし、PR Preview URLで確認する
5. 本番D1のTime Travel復元地点と全量SQLバックアップを取得・検証する
6. 本番Web Workerへ本番D1 bindingを含む一本化版をデプロイする
7. 本番の主要フローを確認する
8. 安定確認期間中は旧 `score-splitter-api` とAPI用シークレットを残す
9. 問題時は本番Web Workerを旧Versionへ戻す。D1 restoreはデータ破損時だけ明示承認を得て実行する
10. 安定確認後、別変更で旧API Worker、Custom Domain、共有Bearer設定、HTTPクライアントを削除する

## 11. 完了条件

- PR作成時に `score-splitter-dev` のブランチPreview URLが発行される
- Preview URLからパスワードでログインできる
- Preview上で収入・支出・繰越、月コピー、月別集計、ウェイトリストが開発D1へ保存される
- Previewから本番D1へ読み書きできない
- 本番切替前のTime Travel復元地点、全量SQL、SHA-256、件数manifestが永続パスに保存され、ローカル復元検証が成功する
- Cloudflare上の開発環境はWeb/APIを兼ねる1 Workerだけで構成される
- 本番Web WorkerもD1を直接呼び、公開HTTP経由でAPI Workerを呼ばない
- 既存の認証、計算、データ保存、ホストルーティングの挙動が維持される
- lint、型チェック、テスト、カバレッジ、build、E2E、workerd previewが成功する

## 12. やらないこと

- 開発用API Workerの作成
- 固定の開発Custom Domain作成
- PRごとのD1作成・削除
- PRプレビューでのパスキー確認
- D1スキーマ変更
- 本番データの開発D1へのコピー
- Cloudflare Accessの導入
- OpenNextから別アダプターへの移行
- 初回一本化と同時の旧本番API Worker削除
