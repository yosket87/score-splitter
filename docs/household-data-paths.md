# 世帯分離のSQL・処理経路台帳

基準: main `c9be1ce`。状態: 実装前棚卸し。以下は移行の確認対象であり、世帯対応済みの証跡ではない。行番号は基準コミット。

## 通常経路とデータ操作

全家計処理はAction/RSC → APIアダプター → D1共有関数へ認証済み世帯を伝播する。モック分岐はHTTP → MSWで同じ認可契約を検証する。

| ファイル/関数 | SQL参照位置 | 対象と確認点 |
|---|---|---|
| `records.ts` / `listRecordsByMonth` | 95 | 3明細の月一覧、表示順を維持して世帯条件を追加 |
| `records.ts` / `listMonthlyAmounts` | 103,104 | 収入/支出の全月集計。世帯の月一覧・年次グラフへ繋がる |
| `records.ts` / `createRecord` | 131,150,167 | 3明細INSERTに所属を明示。支出AI分類列の扱いを維持 |
| `records.ts` / `updateRecord` | 192,209,219 | 世帯＋IDで更新。ラベル変更時のAI分類消去を同一UPDATEで維持 |
| `records.ts` / `patchRecordFlag` | 238,246 | 支出繰越/繰越清算フラグ。世帯＋ID |
| `records.ts` / `deleteRecord` | 253 | 世帯＋IDのDELETE。不存在と他世帯を同じ失敗へ |
| `records.ts` / `insertRecordStatement` | 273,280,286 | コピーbatch内INSERT。呼出元だけでなく関数引数にも世帯必須 |
| `records.ts` / `getRecordRow` | 293 | 更新後再取得にも世帯条件 |
| `copy-month.ts` / `getCopyMonthPreview` | 54,58,63,64,65,66 | コピー元/先の3表×2月を同一世帯で照会 |
| `copy-month.ts` / `copyMonthData` | 109,112,115,157 | replace削除と全INSERTを同一世帯・原子的batchへ。選択IDの所有/元月/確認値を検証 |
| `copy-month.ts` / `loadExistingKeys` | 165,169 | skip重複判定が別世帯と衝突しない |
| `copy-month.ts` / `buildCarryoverStatements` | 191,195,205 | 未清算繰越、繰越指定支出、コピー先重複を同一世帯で照会 |
| `ai-diagnosis-store.ts` / `getDiagnosisContext` | 94〜106 | 4か月分の3明細とsource revisionを同一世帯・batchで取得 |
| 同 / `acquireDiagnosisLease` | 149,159,189 | 月結果INSERT、世帯guard/月leaseの相互EXISTS、日次回数/cooldown |
| 同 / `saveExpenseCategories` | 265〜296 | requested JSON、ownership、eligible JOIN、最終UPDATEすべてで世帯を一致させる |
| 同 / `getLeaseRejection` | 323,374 | 世帯のguard/月leaseだけからbusy/cooldown/daily_limitを返す |
| 同 / `releaseGlobalGuard` | 395 | 補償解放も世帯＋実行token |
| 同 / `getSavedDiagnosis` | 409 | 世帯＋月 |
| 同 / `saveDiagnosis` | 436,468 | 世帯＋月＋所有token＋期限＋世帯revision。失敗後revision照会も同じ世帯 |
| 同 / `releaseDiagnosisLease` | 484 | 世帯＋月＋所有token、解除triggerと連動 |
| `payment-store.ts` / `readPaymentMonth` | 36〜48 | 月revision、3明細、台帳JOIN、取消JOINを同じ世帯で取得 |
| 同 / `findOperation` / `replayOperation` | 75 | 世帯＋operation ID。別世帯の同IDと共存 |
| 同 / `writeOperation` | 126,138,147,158,163 | operation/取消/記録/revision更新の単一batch。例外時replayも同じ世帯 |

SQLファイルのパスは `cloudflare/worker/src/` 配下。精算計算とCSVは取得済み配列から生成し、独立したSQL入口はない。振込snapshotと再送結果JSONも所属台帳経由でのみ返す。

## 認証と公開処理

| ファイル/操作 | SQL参照位置 | 認可契約 |
|---|---|---|
| `sessions.ts` 作成 | 24 | 認証成功したサーバー処理が所属を指定。任意の家計リクエストから発行させない |
| 同 token照会/削除 | 35,50 | tokenから世帯を解決する境界。照会後に期限/所属実在を確認 |
| `passkeys.ts` 一覧 | 25 | 認証済み世帯の管理一覧 |
| 同 credential照会 | 32 | 認証前の署名検証内部だけの検索と管理用検索を区別。結果は公開しない |
| 同 作成/counter更新/削除 | 52,72,76 | 登録は認証済み世帯。counterは署名検証済み所属。削除は現在世帯＋ID |
| `challenges.ts` 作成/最新照会/削除 | 26,51,62〜65 | 登録は世帯内。認証前試行は用途・期限・一回消費の別契約 |
| 同 `deleteExpiredChallenges` | 69 | 期限切れchallengeのみを消す内部メンテナンス。家計読取/変更を許さない |
| `login-attempts.ts` check/failure/reset | 47,62,75,83 | ログイン前の濫用対策。世帯未所属でも必要なので家計スコープ外 |
| `waitlist.ts` register | 30 | 公開LPの登録。入力検証/一意性を維持、家計スコープ外 |

## トリガーと制約

| 定義元 | 対象 | 変更時に守る条件 |
|---|---|---|
| 0001 | 月索引、パスキーperson索引、challenge検索索引 | 世帯付き検索に合う複合索引へ。期限清掃の索引は維持 |
| 0002 | 繰越の月/label/amount/person UNIQUE | 世帯を先頭に追加、業務上の同一判定を維持 |
| 0005 | AI月UNIQUE | 世帯＋月に変更 |
| 0006 | guardのid=1、`release_ai_execution_guard` | 世帯PKと世帯＋所有tokenに変更 |
| 0007 | `increment_ai_revision_after_*` 9件 | insert/deleteは該当世帯。updateは既存の対象列/値変更判定を維持。AI分類保存では増やさない |
| 0008 | `payment_operation_revision` | 世帯＋月のexpected revision比較 |
| 0008 | `payment_record_operation` / `payment_void_operation` | operation/record/voidの世帯と月/操作種別一致を保証 |
| 0008 | 台帳3表のimmutable update/delete 6件 | 移行処理内で必要な補完を行った後、追記専用保護を必ず復元 |
| 0008 | `*_payment_insert/delete/update` 9件 | 世帯＋月のrevision。月変更は同一世帯の旧月と新月を更新 |

## 非同期・キャッシュ・運用

- 家計用のscheduled/queue/waitUntil入口は基準コードにない。AI providerのretryはリクエスト内であり、開始時の世帯を最後まで固定する。
- OpenNextの生成クラス名だけを家計バックグラウンド処理と解釈しない。実際のbinding/handlerと家計SQLの呼出元を確認する。
- HTTPはno-store。URL再検証は現行URLを維持し、取得時認可を通す。永続データキャッシュを追加する場合は別途世帯キーが必須。
- CSV/精算内訳/グラフは上記で限定された入力だけを消費する。AI、コピーpreview、パスキー一覧、振込再送のクライアント状態も世帯境界で破棄する。
- 旧HTTPは `index.ts → authenticated-router.ts / ai-diagnosis-router.ts / payment-router.ts`。家計処理全体をBearer＋DBセッションへ揃える。配備済み旧Version/Previewからの到達も停止または対応版へ更新する。
- バックアップ/復元/検証スクリプトは運用のDB全体操作として区別し、業務APIから呼び出さない。実D1検証は毎回隔離DBを使う。

## 実装完了時の再照合

`rg -n 'prepare\(|batch\(|DELETE FROM|scheduled|waitUntil|cron|queue' cloudflare/worker/src src/lib/api scripts` と追加migrationを照合し、この台帳の各家計操作に世帯条件と対応する越境テストがあることを確認する。表の追加やSQL入口の新設を黙って除外しない。
