# 振込状態表示の実装計画

更新: 2026-09-05。基準main `bcb51ff`、作業ブランチ `feat/payment-status`。
仕様: [振込前・振込済みの状態表示](002-month-close-spec.md)。状態: DONE（機能実装・ローカル検証済み）。本番migration・デプロイは未実施。

## 旧計画からの変更

明細の編集ロック、月の再開、closedガード、コピー先のassertion、AI分類拒否、締め世代テーブルを削除する。実支払記録・取消・差額計算・二重登録防止は維持する。画面は最新mainの精算内訳を残して状態表示を追加する。

目安は3〜5日（DB/記録1〜2日、Action/UI1〜2日、回帰/E2E1日）。旧案の4.5〜8日より範囲は縮小するが、記録の整合性検証は省略しない。

## 1. 振込記録と差額計算

主な実装ファイル:

- 新規 `src/types/payment-status.ts`、`src/lib/validations/payment-status.ts`、`src/lib/utils/payment-status.ts`
- 新規 `cloudflare/worker/src/payment-status.ts`、`payment-store.ts`
- 新規 `cloudflare/worker/migrations/0008_add_payment_records.sql`（実装開始時に番号再確認）
- 新規 `tests/unit/payment-status.test.ts`、`tests/unit/cloudflare/payment-store.test.ts`
- 新規 `scripts/test-payment-d1.mjs`、`package.json`・`package-lock.json`（専用test:d1:paymentと明示Miniflare dev依存）

RED→GREEN: 振込前、振込済み、差額増減・逆転、目標0の返金、取消・置換、安全整数境界を先にテスト。DBに台帳・月revision・AFTER変更検知を追加。家計データを拒否するトリガーは作らない。

`npm run test:run -- tests/unit/payment-status.test.ts tests/unit/cloudflare/payment-store.test.ts` と追加予定 `npm run test:d1:payment`（`node scripts/test-payment-d1.mjs`）が成功すること。

専用ローカルD1で全migration適用後、二重登録、応答消失再送、後半失敗rollback、取消競合、全明細経路のrevisionを検証。同時編集が記録より前／後の両順序を検証し、記録後の編集は成功することをassertする。通常Unitから分離し、一時DBのみ使用する。

## 2. API・Server Actions

主な実装ファイル:

- 新規 `src/lib/api/payment-status.ts`、`src/app/actions/payment-status.ts`、`cloudflare/worker/src/payment-router.ts`
- 既存 `cloudflare/worker/src/authenticated-router.ts`
- 新規 `tests/integration/actions/payment-status.test.ts`、`tests/unit/cloudflare/worker-payment-status.test.ts`

RED→GREEN: 未認証・偽actor拒否、古いrevision、正しい月の再検証、同一キー再送。通常の直D1とモック／旧HTTPの契約を揃える。既存ActionResultを維持し安全なエラー文言へ変換。

`npm run test:run -- tests/integration/actions/payment-status.test.ts tests/unit/cloudflare/worker-payment-status.test.ts` と `npx tsc --noEmit --incremental false` が成功すること。

## 3. 要約に振込状態を追加

主な実装ファイル:

- 既存 `src/app/[year]/[month]/page.tsx`、`src/features/monthly-overview/index.tsx`
- 新規 `src/features/payment-status/index.tsx`、`payment-history.tsx`（状態と確認フォームはパネル内に集約）
- 新規 `tests/components/features/payment-status.test.tsx`
- 既存 `tests/components/features/monthly-overview.test.tsx`

RED→GREEN: 振込前/済み/差額あり/不要、取得失敗、0円でも返金必要、再送キー維持、履歴取消。既存の精算内訳を残す。readOnly propsを各明細に追加しない。Next.jsの関連同梱ガイドを先に確認する。

`npm run test:run -- tests/components/features/payment-status.test.tsx tests/components/features/monthly-overview.test.tsx tests/components/features/settlement-breakdown.test.tsx` が成功すること。

## 4. モック・ブラウザ・回帰

主な実装ファイル:

- `src/mocks/db.ts`、`handlers.ts`、新規 `payment-status.ts`、`payment-handlers.ts`（seedデータは維持）
- 新規 `tests/e2e/payment-status.spec.ts`
- `docs/features.md`、`database.md`、`testing.md`、`deployment.md`
- `plans/README.md`、本計画
- 新規 `.github/workflows/payment-d1.yml`（関連変更とnightlyの独立検証Job）

モックは状態を返すだけでなく記録・取消・revisionを保持。E2Eは振込登録→そのまま編集→差額表示→追加登録→誤記訂正。375/1280px、ライト/ダークでスクリーンショット確認する。CSV・コピー・精算内訳も維持する。

```bash
npm run dev:mock
npm run test:e2e -- tests/e2e/payment-status.spec.ts
npm run test:coverage
npx tsc --noEmit --incremental false
npm run lint
npm run build
npm run test:e2e
npm run test:d1:payment
```

dev:mockは別プロセス、passwordログイン。全件成功と80%以上基準を維持。重いD1検証は通常Unitへ混ぜず、各独立Jobの所要時間を測る。

## 移行と復旧

既存月は記録なしで移行。ローカル検証→開発DBに追加migration→アプリ→開発検証の順序。本番は既存のバックアップ・配備手順に従い、この文書改訂では接続しない。

障害時は記録UIを取り下げても既存家計編集を継続できる。支払履歴・revisionテーブルをDROPしない。書込後の無条件DB復元で支払記録を失わない。競合・取消・差額を検証できなければ配備しない。

## 現時点の検証

最新origin/mainをfetchし `bcb51ff` を起点にブランチ作成済み。文書の旧ロック方針を置換した。前回の旧SHAに対する86テスト・14計算例・D1原理検証とは別に、以下の改訂仕様に対する実装検証を実施した。


## 完了記録（2026-09-05）

- 最新main `bcb51ff` をfetch確認し、`feat/payment-status` で実装。既存精算内訳を維持。
- 96ファイル・1,045テスト成功。カバレッジ: 文90.42%、分岐85.70%、関数91.31%、行91.66%。80%基準を維持。
- `npx tsc --noEmit --incremental false` 成功。`npm run lint` は0エラー（既存passkey-login-buttonの遷移方法警告1件）。
- `npm run build` 成功。既存middleware非推奨警告あり。
- E2E全68件成功（2.4分）。振込機能5件には、登録後編集・差額・取消・訂正と2サイズ×2テーマの画面検証を含む。
- 実D1: 全migration、実records CRUD・フラグ、copyMonthData add/全skip/replace、同時登録、同じキーの同時再送、読取後の編集競合、snapshot不変、取消・置換途中のrollbackが成功。
- コード／セキュリティレビュー済み。支払合計の履歴順依存をBigIntで解消し、モックにも訂正後の安全整数検証を追加。修正後レビューで高リスク未解決事項なし。
- 初回ブラウザ検証でモックHTTPのoptionalパス不一致を修正して回帰テストを追加。開発中のHMRとMSWの干渉を避け、コードを固定してサーバー再起動後のE2E全体を実行。
- 最終目視でダークCTAの文字色を既存accent-foregroundへ調整。状態別スクリーンショットは `test-results/payment-status-*/` 配下。
- コミット・push・本番migration・デプロイは行っていない。配備時は0008の適用が必要。
