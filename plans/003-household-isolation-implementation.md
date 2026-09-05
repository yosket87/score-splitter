# Issue #102: 既存家計の世帯分離・実装計画

作成日: 2026-09-05。状態: 実装承認済み・着手中（本番変更は別承認）。

対象: [Issue #102](https://github.com/yosket87/score-splitter/issues/102)。調査基準は最新mainの `c9be1cebff5d7da9b87eecab7f2b0ab020731d16`。以下の既存ファイルの行番号はこのコミットを基準とする。

## 1. 調査結果と実装範囲

- IssueはOPEN、コメントなし。調査時点のOpen PRは0件。
- 作業ツリーのHEADは `377fbc5`。`git fetch origin main` で最新コードを読み取り、作業ファイルは切り替えていない。実装開始時は最新mainから作業ブランチを作り、この計画を引き継ぐ。
- [PR #93](https://github.com/yosket87/score-splitter/pull/93) のAI診断、[PR #100](https://github.com/yosket87/score-splitter/pull/100) の精算内訳、[PR #101](https://github.com/yosket87/score-splitter/pull/101) の振込記録まで対象にする。振込記録はIssue本文の列挙にないが、「全データ経路」の分離に不可欠。
- 共有D1への直接アクセスが通常経路。既存家計のSQLには世帯条件がなく、認証後もデータ操作へ世帯が渡らない。
- AI結果は月単位の一意制約、AIの実行guard・source revisionは `id = 1` の単一行。別世帯の編集や診断を独立させるには、データと実行制御の両方を変更する。
- 最新mainの振込記録には、月単位のrevision、operation IDによる再送、追記専用台帳、更新・削除禁止トリガーがある。これらも分離する。
- 永続データキャッシュの導入は確認されず、HTTPは `no-store`。一方、振込の `sessionStorage` は月だけをキーにしている。
- バックアップは全量SQLをexportするが、件数照合は8テーブル固定。AI3テーブル・振込4テーブルも照合対象へ加える必要がある。
- 実環境の稼働Version・適用済みmigration・本番データは今回未調査。Gitの最新状態を本番配備済みとはみなさない。

今回の到達点は「既存利用者の操作・認証・家計結果を維持し、テスト用2世帯で全経路の分離が成立する本番リリース」。Googleログイン・users・membershipsは[後続#103](https://github.com/yosket87/score-splitter/issues/103)、外部世帯の利用開始は#104、世帯切替UIは#113で扱う。

## 2. 採用する設計方針

### 認可境界

1. **1世帯＝1テナント、共有D1＋household_id**を採用する。現在の構成・移行量に適し、DB分割は#118の実測判断に残す。比較と判断理由は新規ADRへ記録する。
2. `households` に不透明な主キーと既存認証用の一意な識別子を持つ既存世帯を作成する。既存世帯はmigrationで作り、リクエスト時に自動作成しない。
3. `requireHouseholdContext()` をサーバー境界に置く。有効なセッションと実在する世帯から、読み取り専用の `householdId / person / authMethod` を返す。欠損・期限切れ・不明な世帯は拒否し、先頭世帯や既存世帯へフォールバックしない。
4. 既存セッションとパスキーの所属はmigrationで補完し、Cookie・credential ID・公開鍵・counterを保持する。共有パスワードの検証成功時のみ既存世帯を明示的に選ぶ。旧パスキーのログインは署名検証済みcredentialの所属を使い、今回許可する既存認証の範囲を超えるcredentialを受け入れない。
5. 家計API・D1ドメイン関数は世帯コンテキストを必須引数とし、省略可能な引数・既定値を設けない。型に加え、実行時にも空・不正なコンテキストを拒否する。クライアント入力の `householdId` を認可根拠として採用しない。
6. 読取・更新・削除・フラグ更新は `household_id` をSQL条件へ含める。作成は認証済み世帯を明示保存し、家計レコードの世帯変更は提供しない。他世帯IDは存在しないIDと同じ404相当の失敗にする。現在一部の削除等が存在しないIDでも成功する挙動は、この認可契約へ揃える。
7. `Person = husband | wife` は家計上の担当者として維持し、世帯IDや将来の個人IDへ置き換えない。

セッショントークンの検証、署名検証前のcredential検索、認証challenge、ログイン試行制限は、家計へのアクセス前に必要な認証処理として別契約を持つ。これらの検索結果だけで家計へアクセスさせず、署名・期限・認証方式・所属の検証後にコンテキストを発行する。パスキー管理と登録challengeは認証済み世帯へ限定する。認証前challengeを未認証家計アクセスの抜け道にしない。

### 最終スキーマ

| 対象 | 最終的な境界・制約 |
|---|---|
| `households`（新規） | 主キー、一意な既存認証識別子、作成日時。世帯作成・削除の公開APIは作らない |
| `incomes / expenses / carryovers` | `household_id NOT NULL`＋世帯FK、`(household_id, month)`中心の索引。既存IDと金額・フラグを保持 |
| `carryovers` | 現行の業務キーにhouseholdを加えた `UNIQUE(household_id, month, label, amount, person)` |
| `sessions / passkey_credentials` | 所属世帯を必須化。token/credential IDによる認証検索と認証済み管理検索を区別 |
| `webauthn_challenges` | 登録challengeは世帯必須。認証前challengeはtypeごとの許容条件・一回消費・期限を保持し、無条件の既存世帯補完をしない |
| `ai_diagnoses` | `UNIQUE(household_id, month)`。結果・入力hash・実行tokenを同じ境界にする |
| `expenses` のAI分類列 | 独立した分類テーブルは現状ない。対象支出の所有権と実行世帯を一致させ、ラベル変更時の分類消去を維持 |
| `ai_execution_guard` | 世帯ごとに1行。月を跨ぐ同時実行制御・cooldown・日次回数を世帯内で共有 |
| `ai_diagnosis_source_revision` | 世帯ごとに1行。現行の対象列・条件を維持し、INSERT/UPDATE/DELETEで該当世帯のみ増加。AI内部分類列の保存では増加させない |
| `month_payment_revisions` | `PRIMARY KEY(household_id, month)` |
| `payment_operations` | 世帯内のoperation IDを一意にする。別世帯の同じoperation IDは共存し、再送は自世帯の結果だけを返す |
| `payment_records / payment_voids` | 世帯FK、operation/paymentとの複合FK・一意制約で同一世帯を保証。履歴・snapshot・更新削除禁止を維持 |
| `login_attempts / waitlist_entries` | 認証前の濫用対策・公開LPのデータとして別管理。家計コンテキストを要求しない理由をSQL台帳に明記 |

既存15テーブルにhouseholdsを追加する。支出分類用の共有キャッシュ、世帯切替、料金・人数上限などは追加しない。

### コピー・AI・振込で守る条件

- 月コピーはプレビュー・コピー元・対象選択ID・コピー先・重複判定・replace削除を同じ世帯に限定する。送信されたlabel/amount/personを信用せず、選択IDをコピー元月と世帯で再取得する。コピーする値がプレビュー時と異なる場合は409相当の競合で再プレビューを求め、確認していない最新額へ黙って置き換えない。labelOnlyでは金額をコピーしない既存仕様を維持する。不正IDの混入は書込前に拒否し、replace後の途中失敗もbatch全体を戻す。振込履歴はコピーしない。
- AIはActionで作るリクエスト専用repositoryに世帯を固定する。context、保存済み結果、lease取得、分類保存、診断保存、releaseのすべてに同じ世帯を渡す。カテゴリ更新のJOIN・UPDATEにも世帯条件を付ける。
- AIのrevision変更を検知して古い結果を拒否する仕組み、期限切れleaseの引継ぎ、古いrun tokenで新leaseを解除できない条件を維持する。別世帯の編集・実行は影響させない。
- 振込の月次revision・再送確認・履歴JOIN・snapshot取得・訂正/取消対象・保存batchを世帯で閉じる。別世帯の操作IDを指定しても結果を返さない。台帳内のJSONや過去snapshotに後から世帯情報を書き足さない。

## 3. ファイル別の変更内容

「新規」は実装時に作成予定。既存ファイルの行番号はmain `c9be1ce` の参照位置であり、変更後の位置ではない。

| ファイル・参照位置 | 具体的な変更 |
|---|---|
| `docs/adr/0001-household-isolation.md`（新規） | 共有DB方式、認可契約、認証前の例外、移行とrollbackの判断を記録 |
| `cloudflare/worker/migrations/0001_initial.sql:1`、`0002_add_carryover_unique_index.sql:1`、`0005_add_ai_diagnosis.sql:1`、`0006_add_ai_execution_guard.sql:1`、`0007_add_ai_source_revision.sql:1`、`0008_add_payment_records.sql:1` | 参照元。既存migrationを改変せず、0009以降の追加migrationで段階移行する |
| `cloudflare/worker/src/households.ts`、`src/lib/household-context.ts`（新規） | 世帯の存在検証・既存認証の明示的解決・サーバー用コンテキスト。汎用の既定世帯は設けない |
| `src/types/index.ts:15`、`src/lib/api/sessions.ts:17`、`src/lib/webauthn/session.ts:19,50,55,91,107` | Session/API/Zodに世帯を追加し、セッション検証と認可コンテキスト発行を統一 |
| `cloudflare/worker/src/sessions.ts:15,33`、`src/app/actions/auth.ts:50` | 既存tokenを保持しつつ所属を検証。パスワード成功時の発行先を明示 |
| `src/app/actions/passkeys.ts:41,88,178,227,242,267`、`src/lib/api/passkeys.ts:26,96,128`、`cloudflare/worker/src/passkeys.ts:21,38,69,75`、`cloudflare/worker/src/challenges.ts:16,42,56,68` | 管理・登録challenge・作成・削除を世帯限定。検証済みcredentialの所属をセッションへ渡す。新規登録のuser handleも世帯を考慮し、既存credentialの互換を維持 |
| `src/middleware.ts:18,81`、`src/app/login/page.tsx:6` | middlewareを認可本体とみなさず、欠損・不明世帯をログイン済み扱いしない回帰テストを追加 |
| `cloudflare/worker/src/records.ts:82,101,113,175,226,251,256,292` | CRUD・フラグ・月一覧・サマリーの全SQLに世帯を必須化し、更新後の再取得とコピー用INSERTも同じ条件にする |
| `src/lib/api/records.ts:38,111,130`、`src/lib/api/monthly-summary.ts:20` | 共通APIファクトリーと直接D1/HTTPの両分岐へコンテキストを渡す |
| `src/app/actions/income.ts:14`、`expense.ts:15`、`carryover.ts:15`、`monthly-summary.ts:10`、`entry-helpers.ts:1` | 全Actionで世帯を解決し、作成/更新/削除/フラグへ伝播。認証拒否を正常な空データへ変換しない |
| `cloudflare/worker/src/copy-month.ts:46,107,163,181,246`、`src/lib/api/copy-month.ts:43,64`、`src/app/actions/copy-month.ts:20,38` | コピー全経路と対象ID検証、replace削除、重複判定を世帯限定 |
| `cloudflare/worker/src/ai-diagnosis-store.ts:88,134,222,284,296,316,393,404,428,478`、`src/lib/api/ai-diagnosis.ts:115,128,143,164,189` | AI読取・制御・保存のSQL/引数を世帯単位へ。全SQLは実装前の台帳で一文ずつ列挙 |
| `src/app/actions/ai-diagnosis.ts:37,54,98,122` | repository生成時に世帯を束縛し、診断の途中で別スコープへ流れない構造にする |
| `cloudflare/worker/src/payment-store.ts:32,73,80,111`、`payment-status.ts:18,45,49,59,95`、`src/lib/api/payment-status.ts:18,23,28,33`、`src/app/actions/payment-status.ts:13,37,44,53,62` | 振込読取・revision・履歴・再送・記録・訂正を世帯限定。actorとデータの世帯を一致させる |
| `cloudflare/worker/src/index.ts:30`、`authenticated-router.ts:1`、`ai-diagnosis-router.ts:20`、`payment-router.ts:12`、`src/lib/api/client.ts:14,33` | 振込で既存のBearer＋`x-household-session`契約を全家計HTTPルートへ共通化。認証前の制御用ルートとは分離 |
| `src/app/[year]/[month]/page.tsx:23,31,61`、`src/app/[year]/page.tsx:1`、`src/app/page.tsx:1`、`src/app/settings/page.tsx:6,25` | 世帯を解決して取得し、Client境界にサーバー由来scopeを渡す |
| `src/features/monthly-overview/index.tsx:188,225`、`src/features/payment-status/index.tsx:40,77,133`、`src/features/ai-diagnosis/use-ai-diagnosis.ts:32,49,98,289` | React key・storage・遅延応答の有効性判定に世帯を含める。旧storageキーを別世帯へ自動移管/再送しない。既存世帯の未確認操作は、サーバー側の操作結果・履歴から確認できる導線を維持 |
| `src/features/copy-month/index.tsx:37,68,96`、`src/features/passkey/index.tsx:12,16` | 世帯変更/再ログイン時の選択・preview・一覧状態を破棄し、古い応答を無視 |
| `src/app/actions/revalidation.ts:4`、`src/features/export-csv/index.tsx:23`、`src/lib/utils/calculation.ts:1`、`src/lib/utils/csv.ts:1` | 取得/再取得の世帯分離とCSV出力を検証。URL、計算式、CSV形式は維持し、新しい共有キャッシュは導入しない |
| `src/mocks/data.ts:251`、`db.ts:30,227,235`、`handlers.ts:85,95,107,141,168,372,600`、`payment-handlers.ts:13,18`、`payment-status.ts:8` | 2世帯fixture、セッション認可、全読書き・AI・振込・コピーを実装と同じ契約へ。resetも世帯間でテストを汚染させない |
| `scripts/backup-production-d1.mjs:25,40,339,396,642`、`tests/unit/scripts/backup-production-d1.test.ts:1` | migration段階に応じた全テーブル照合、manifest更新、復元検証。AI/振込/householdsの検証漏れを拒否 |
| `scripts/test-payment-d1.mjs:1`、`scripts/test-household-d1.mjs`（新規）、`tests/helpers/cloudflare-worker-fake.ts:33,61,88,149` | 実D1用fixture/実関数呼出しとFakeを世帯対応。実SQLによる越境・制約・trigger検証を主証拠にする |
| `.github/workflows/test.yml:9`、`.github/workflows/e2e.yml:9`、`.github/workflows/payment-d1.yml:1`、世帯D1検証workflow（新規）、`vitest.config.ts:12`、`package.json:8` | 独立Job・関連path検証・nightly・対象テスト用コマンド。Worker共有関数もカバレッジ対象に加える |
| `docs/database.md:1,59,73`、`docs/deployment.md:98,174`、`docs/testing.md:129`、`docs/architecture.md:1` | スキーマ、認可経路、旧HTTP契約、段階移行、停止条件、証跡とrollback手順を更新 |

## 4. 移行・リリース順序

### 原則

- 既存migration 0001〜0008は変更せず、0009以降を追加する。番号は着手時に最新mainを再確認して採番する。
- 旧コードが稼働する互換期間は、DB内の家計を既存1世帯に限定する。未分離の旧WorkerやPreviewから2世帯目を読める状態を作らない。
- DB列に永続的な既存世帯DEFAULTを置かない。旧コードがNULLで書く期間を把握し、最終の停止中に追補する。アプリの実行時fallbackで取り繕わない。
- 自動migration一括適用によって後段の制約強化まで進まないよう、段階ごとのPR/リリースに含めるmigrationを分ける。利用切替前の版へ最終migrationを同梱しない。
- D1は外部キーを強制するため、再構築を `foreign_keys=OFF` 前提で設計しない。必要な遅延は `defer_foreign_keys` を使い、FK違反0件まで同一migration内で完結させる。[Cloudflare公式の外部キー仕様](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- 複数文書込はD1のbatchの原子性を維持する。migrationは適用順と段階ごとの状態を実D1で検証する。[D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### A. 追加と運用準備

1. 対象main・Worker Version・D1 UUID・適用済みmigration・旧HTTP/Previewの稼働経路を照合する。特に0008の本番適用有無を確認する。
2. バックアップ検証を先に拡張する。適用済みschemaの期待テーブル集合を明示し、migration段階にないテーブルの不存在と、存在すべきテーブルの欠落を区別する。未知の業務テーブルを黙って除外しない。
3. `households`、既存世帯、nullableな所属列、互換性を壊さない索引を追加する。旧アプリによる既存操作を回帰確認する。
4. migration試験で、すべてのINSERTが列名を明示しているか、SELECTのmapperが列追加を許容するかも確認する。

### B. 既存データの補完

1. 明細、既存セッション、credential、適切なchallenge、AI結果/制御、振込の4テーブルを既存世帯へ明示的に対応付ける。
2. 振込台帳は `PAYMENT_IMMUTABLE` により通常UPDATEできない。migrationのトランザクション内で必要なトリガーを外し、補完/再構築して元の保護を復元する。保護が外れた状態を別リリースとして公開しない。
3. テーブルコピー中にAI/振込revisionのトリガーを発火させない順序とする。移行直前のrevision・日次利用回数・結果・台帳JSONを保持する。
4. 初回補完後も旧版からのNULL書込があり得る。補完完了時刻と残存NULLを記録し、利用切替時に必ず追補する。旧認証以外の未知データを既存世帯へ割り当てない。

### C. 世帯を指定するコードへ利用切替

1. 世帯対応アプリ・世帯対応HTTP入口・mockと検証を先に完成させ、互換性表に対象SHA/Versionを記録する。
2. 短い切替時間を設け、旧HTTPを含む家計への全アクセスと新規認証発行を止める。AIの新規実行を止め、実行中の処理の完了またはlease期限切れを確認する。古い処理が後から書き込まないことを確認する。
3. 最終補完・件数/金額/結果照合後、AI単一行、月単位の一意制約、振込のrevision/operationキー、関連triggerを世帯単位へ切り替える。新旧SQLの互換を検証できないこの工程では旧アプリを再開しない。
4. 世帯対応版を配備し、既存1世帯の読取・更新・認証を確認して利用を再開する。個別の非互換migrationと配備の間も旧アプリからDBへ到達させない。
5. 対応しない旧HTTPの稼働Version・workers.dev/カスタムドメイン・古いPreviewについて、対応版への更新またはDBアクセス停止を実確認する。ソースコードの変更だけで旧入口を対処済みにしない。

### D. 制約強化とリリース確定

1. 対応版だけが書込中であること、所属NULL/不明世帯/越境参照が0件であることを確認し、後続migrationで家計・所属列のNOT NULL/FK/一意制約を最終形へ強化する。
2. 列追加・補完・利用切替・制約強化のそれぞれを、実D1の段階fixtureで再現する。再構築後に台帳の更新削除禁止、AI/振込trigger、FKを再確認する。
3. 2世帯の実D1試験と開発環境検証を完了する。既存Previewがdev D1を共有するため、移行演習と2世帯fixtureには隔離した開発D1を使う。共有devへ入れる場合は旧版から到達できないことが前提。
4. 本番は既存世帯のみを提供する。テストのために本番へ架空世帯を追加せず、一般登録も開放しない。

### 切り戻し可能範囲

| 段階 | 方針 |
|---|---|
| 追加・補完まで、既存1世帯のみ | 旧版との互換テストを通した組合せに限りアプリを戻せる。追加列・補完データは原則残す |
| キー/trigger切替後 | 世帯対応schemaを扱える版をrollback先に限定。未分離の旧root/旧HTTPへは戻さない |
| 最終制約または2世帯データが存在 | 未分離版へのrollbackを禁止。世帯対応版への修正/forward migrationを優先する |
| データ破損・復元が必要 | 書込を止め、復元点以降の支払/編集への影響を提示して別途明示承認を得る。Time Travel restoreや台帳削除を自動実行しない |

停止条件は、認可の越境1件、件数/金額/精算/台帳の不一致、所属不明、FK違反、想定外の稼働Version/DB、未停止の旧入口、復元検証未PASS、バックアップの不一致・期限超過とする。

## 5. テスト計画と合格基準

### 先に失敗するテストを作る

同じ年月・ラベル・担当者・金額・operation IDを持つ世帯A/Bを作り、下記のテストが現実装で失敗することを確認する。新契約の導入後もSQLの世帯条件を一時的に外す等でテストの検出力を確認し、偽の成功を避ける。

| 観点 | 検証内容 |
|---|---|
| 認可 | 無Cookie・偽造/期限切れtoken・世帯NULL・不明世帯・未指定contextを拒否。自己申告世帯で越境不可。既存セッション/パスワード/パスキーは維持 |
| CRUD/flags | AからBのIDによる取得・編集・削除・フラグ更新が失敗し、Bの値・件数・revisionは不変 |
| 一覧・集計 | 月一覧、年次/月次集計、精算内訳、空月が自世帯のみ。同月・同内容が両世帯に共存 |
| CSV | AでダウンロードしたCSVにB固有の行・金額がない。形式・符号・既存精算計算を維持 |
| コピー | add/skip/replace、同月条件、選択ID改ざん、金額改ざん、プレビュー後の変更/削除、空選択、途中失敗。Bのコピー元/先を読書きできず、Bのrevision/振込履歴は不変 |
| AI | context/分類/結果/lease/save/releaseすべて越境拒否。Aの実行中にBは実行可能。Aの日次上限でBを制限しない。Aの編集でBの結果をstaleにしない。同一世帯の競合/古いtoken拒否は維持 |
| 振込 | 同じoperation IDがA/Bに共存。再送・履歴・結果確認・訂正/取消・snapshotが自世帯のみ。別世帯FK・他世帯payment IDを拒否。同一世帯の二重送信/競合/原子性を維持 |
| パスキー | Aの一覧にBが現れず、直接ID削除と登録challengeの使い回しを拒否。既存credentialの署名検証・counter更新・ログイン成功を確認 |
| HTTP/mock | Bearerのみの家計アクセスを拒否。実セッションから世帯を解決し、D1/HTTP/MSWを共通契約テストで照合。認証前ルートとLPの回帰も確認 |
| クライアント | 同一月でA→Bへ再レンダー/再ログイン。AIの遅延応答、コピーpreview、パスキー一覧、振込確認/未確認操作が引き継がれない。旧月だけのstorageキーを新世帯へ再送しない |
| 移行/復元 | 0001から全migration、0008までの既存データから段階移行、旧版の追加列互換、補完後の旧版書込→追補、制約強化、失敗rollback、復元後の制約/triggerを検証 |

追加・更新先は、`tests/unit/lib/webauthn/session.test.ts`、`tests/integration/actions/*`、`tests/unit/cloudflare/*`、`tests/integration/api/*`、`tests/integration/mocks/*`、`tests/components/features/*`、新規 `tests/e2e/household-isolation.spec.ts`、新規の実D1世帯分離fixtureを中心とする。

### データ照合と復元演習

- schema段階ごとの全業務テーブルの件数を照合する。households追加分と一時状態の意図的な差分は明記する。
- 家計明細はID集合、月/担当者別件数・金額合計、符号、フラグ、月別精算結果を照合する。
- AIは分類・保存済み結果・入力hash・revision・日次回数を照合する。実行中leaseは停止/完了後の状態を基準とする。
- 振込はID・operation ID・input/result/snapshot JSON・支払額・支払日・取消・revisionを照合し、履歴を改変しない。
- バックアップのSQL実体・SHA-256・権限・HEAD・期限条件を維持し、SQLite復元のintegrity check/FK checkに加え、隔離D1への復元後に実関数を動かして制約とtriggerを検証する。機微なSQL/認証情報はGitへ保存しない。
- 本番移行時の比較元/比較先は書込停止中に採取し、稼働中の別時点の件数を同じsnapshotと扱わない。

### CI・ブラウザ

- lint、typecheck、Unit/Integration＋coverage、build、E2Eは依存がなければ別Job。Worker共有ドメインもカバレッジに含め、変更領域を含む80%以上を確保する。
- 既存 `npm run test:d1:payment` を維持・世帯対応し、新規 `test:d1:household` を追加する。実Miniflare/D1とmigration試験は通常Vitestから分離する。
- D1専用Jobはschema・共有ドメイン・認可/API契約・検証スクリプト・設定変更時に実行し、全migration/復元はnightlyでも検証する。独立fixtureの分割時はDBも分離する。
- 必須CIは10分以内を目標に工程時間を測り、15分超を退行として調査する。timeout延長だけで対処しない。
- `npm run dev:mock` でログイン（`password`）し、正常・空月・境界値・モバイル/デスクトップをブラウザで確認してスクリーンショットを残す。2つの独立ブラウザセッションで越境と再ログイン時の状態を確認する。
- 開発PR Previewで認証保護・既存家計・AI・振込を確認する。PreviewのWebAuthn RP不一致は既存制約なので、パスキー実機確認はRPが一致する検証先で行う。
- 各実装段階でコードレビュー、認可/SQL/認証変更のセキュリティレビューを行う。

## 6. 作業項目・PR分割・概算

下記は論理的な作業順序。全コードを完成・検証してから各配備段階へ進め、途中PRだけでIssueを閉じない。概算は実装・検証の作業時間で、レビューや外部承認待ちは含まない。

| 順序 | 作業項目 | 完了の証拠 | 概算 |
|---|---|---|---|
| 1 | [ ] 最新mainへ追従、全SQL/trigger/認証前操作/定期処理の台帳、ADR、バックアップ照合拡張 | 適用段階別schema、全表復元テスト、経路ごとの担当境界 | 3〜5時間 |
| 2 | [ ] 2世帯の認可REDテスト、段階migration、households/session/credential/context | 未認証・欠損世帯拒否、既存認証維持、補完と追補テスト | 5〜8時間 |
| 3 | [ ] CRUD/集計/コピー/AI/振込、HTTP/MSW、クライアント状態を一貫して変更 | 全経路の越境テスト、同月/同operation共存、既存回帰 | 7〜11時間 |
| 4 | [ ] 最終制約、実D1/復元演習、CI、ブラウザ、運用手順と配備証跡 | 段階移行PASS、レビュー、開発検証、承認用リリース資料 | 5〜8時間 |

合計の初期見積りは20〜32時間。アプリ/API/DB/モック/検証に跨ぐ大きな変更となる。2時間ごとに経過・検証済み差分・残作業を見直し、見積りの1.5倍を超える場合は分割や原因を再評価する。

推奨PRは「設計・検証基盤」「追加/補完schemaと認証基盤」「全経路の利用切替」「最終制約・復元/公開手順」の4単位。利用切替PR内のCRUD/AI/振込変更は必要に応じて積み上げPRへ分割してよいが、不完全な境界を外部公開しない。

## 7. 承認と完了判定

この計画の承認は実装着手の承認であり、本番migration・本番配備・本番復元の承認ではない。

本番は `docs/deployment.md:98` の運用に従い、Draft PR、開発Preview確認、対象SHAのバックアップPASSと再検証、停止条件・切り戻し資料を揃えて明示承認を得る。現在のGit連携がmainのmergeで自動配備するため、migrationとアプリの順序を保証できるよう自動配備の保留・再開もレビュー対象にする。

Issue完了は、全経路の2世帯分離、既存認証・金額・精算・AI・振込履歴の維持、実D1移行/復元、必要CI、開発検証を通し、承認された本番リリースと既存世帯の確認を終えた時点とする。

今回実施したのはIssue/PRとコード・公式D1資料の調査、実装計画の作成のみ。アプリコード・DB・配備設定は変更しておらず、テストや実環境の復元演習は実行していない。依存パッケージがないため、実装開始時はlockfileに従って導入し、Next.js 16の同梱ガイドを読んでからコードを変更する。

## 実装タスク

### Task 1: バックアップのschema検証を全業務テーブルへ拡張

担当ファイルは `scripts/backup-production-d1.mjs`、必要なら同ディレクトリの補助モジュール、`tests/unit/scripts/backup-production-d1.test.ts` と追加の対象テストのみ。その他の実装は別タスク。

- 現在8表固定の件数照合を、適用済みmigrationと実在業務テーブルの照合へ拡張する。0001〜0004の既存8表、0005〜0007のAI3表、0008の振込4表、将来0009で追加するhouseholdsを明示したschema段階を扱う。
- 実在業務テーブルの集合と適用済みmigrationから期待する集合の不一致は拒否する。SQLite/Cloudflareの内部表とmigration管理表は明示的に区別する。未知業務テーブルを黙って除外せず、SQL識別子を未検証で補間しない。
- export自体は引き続き全量。SQL復元後に全対象表の件数・integrity_check・foreign_key_checkを確認する。manifestに検証したschema/migration/対象表を記録し、再検証でも整合性を検査する。
- 固定DB UUID/名前、Wranglerバージョン、承認引数、privateな保存root、ファイル権限、SHA-256、HEAD、30分以内、Time Travel情報、原子的PASS作成を維持する。旧manifestを無条件で新しいPASSとして受け入れない。
- TDD: AI/振込表の欠落・件数不一致、未知表、stageとmigrationの不一致、FK違反を検出するREDを先に確認。既存テストを維持して対象テストを実行する。remoteコマンドや本番バックアップは実行しない。
- レポートには変更、テストコマンドと結果、残る懸念を記載する。コミットは担当ファイルのみ・日本語Conventional Commits。サブエージェントは起動しない。

### Task 2: 互換性を維持した世帯列追加と既存データ補完

所有は `cloudflare/worker/migrations/0009_add_households.sql`、`0010_backfill_households.sql`、`scripts/test-household-migrations.mjs` と補助、対応するmigrationテスト、`package.json` の専用test script、`scripts/backup-schema.mjs` の0010名登録とそのテストのみ。アプリの認可コードやその他のバックアップ処理は変更しない。

- 0009でhouseholdsを作り、既存世帯ID `3975b870-bbfa-49fd-ae3d-d273c9f6e107`、legacy_auth_key `legacy`、固定created_atを明示作成する。householdsはid TEXT NOT NULL PRIMARY KEY、legacy_auth_key TEXT UNIQUE nullable、created_at TEXT NOT NULL。
- 所属対象13表（明細3、sessions/passkey_credentials/webauthn_challenges、AI3、振込4）にnullable `household_id TEXT REFERENCES households(id)` を追加する。DEFAULTは置かず、旧SQL/キー/triggerの互換性を維持する。
- 0010で既存世帯がちょうど1件・ID/key一致、未知の非NULL所属なしを事前検査し、NULL所属を補完する。認証challengeだけはNULLのままとし、registrationは所属を補完。未知のtype/認証方式/所属は拒否。SQL assertは一時的な通常CHECK作業表を同一migration内で作成・削除し、RAISEを通常SELECTで使わない。
- payment3台帳のUPDATE禁止triggerだけを同一migration内で解除→household_idだけ補完→完全復元。既存id/token/public key/counter/JSON文字列/金額/日時/AI分類/結果/quota/revisionを保持する。DELETE禁止は維持。
- 旧版が0010以後にNULL書込することを許す互換段階。後段0011/0012はまだ同梱しない。ここで世帯分離完成と主張しない。
- TDD:0008までの15業務表に履歴入りfixtureを用意。0009追加後に旧SQLが動くこと、0010前後の全保持列不変、AI/payment revision/quota不変、正しい所属、authentication challenge NULL、台帳immutable復元、不明所属拒否を検証。0010途中の意図的失敗でDDL/data/trigger/migration台帳がrollbackされることを隔離ローカルWranglerでも確認する。
- SQLiteの短いテストと実Wrangler/Miniflareの検証を区別し、実D1は `npm run test:d1:household-migrations` で通常Unitから独立させる。テスト用DB・設定はtmpに作り、remoteフラグや本番DBへは接続しない。SQL文字列内の空白やコメント記号を破壊する正規表現正規化を使わない。
- 親の補足設計メモ `.superpowers/sdd/003-household-isolation-implementation/migration-design.md` の0009/0010とD1原子性節を参照してよいが、既存世帯は0009で作るこのbriefを優先する。その他の後段提案は実装しない。
- 日本語Conventional Commitsで担当のみコミットし、実行コマンド/RED/GREEN/制約と懸念をタスクレポートへ。サブエージェントは起動しない。

### Task 3: 認証済み世帯コンテキストと認証データ経路

所有: 新規 `cloudflare/worker/src/households.ts`、`src/lib/api/households.ts`、`src/lib/household-context.ts`、既存のsessions/passkeys/challenges共有D1モジュールとAPIアダプター、`src/lib/webauthn/session.ts`、`src/app/actions/auth.ts`/`passkeys.ts`、認証ルート（必要ならauthenticated-routerから分離）、認証関連MSW/FakeD1/fixtures/テスト。家計明細・AI・振込SQLとmigrationは変更しない。必要な型呼出修正は認証境界に限定し、他の家計経路へのscope伝播は後続タスク。

- 不変 `HouseholdContext = Readonly<{ householdId: string }>` を共有し、D1家計関数へ渡す基礎とする。context欠落/空値はruntimeでも拒否。セッションtokenを検証し、期限・実在household JOIN・既知auth_methodを確認してcontextを作る。NULL/不明所属から既存世帯へのfallback禁止。HTTPも同じ解決関数を利用する。
- 既存パスワードログインはbcrypt成功後のみlegacy_auth_key='legacy'でhouseholdを解決し、明示的にその世帯のsessionを作る。パスキー認証は署名検証済みcredentialの所属からsessionを作り、別途既存世帯として許可されていることを確認する（他世帯の新規ログイン解禁は後続Issue）。person husband/wifeは担当者として維持する。
- SessionInfo/ApiSessionにhouseholdId追加。server-onlyのrequireHouseholdContext()を共通境界として提供する。requireAuthは認証済みSessionInfo（householdIdを含む）を返せるようにし、既存の戻り値未使用呼出元を壊さない。セッション期限境界は <= now を無効に統一。無効日時/未知認証方式/所属なしも認証失敗にする。Cookieの属性と有効期間を維持。
- passkey一覧/登録/管理取得/削除、登録challenge作成/検索/消費はcontext必須で世帯条件。認証前credential検索は内部用途を名前で区別し、所属をJOIN検証し返却結果をブラウザに公開しない。署名成功後のcounter更新も検証済み世帯+credential ID。外部payloadのhouseholdIdを認可根拠にしない。
- challengeは登録=世帯、認証前=NULLの別契約。最新challengeを全ユーザーで共有する現状を避け、生成したchallenge IDをhttpOnly短期cookieで当該ブラウザ試行と結び、type/期限/世帯/IDで取得、一回だけ消費する。消費はDELETE RETURNING等の原子的操作で行い、二重検証がsessionを二回発行できないことを検証。登録時も世帯+challenge IDで対応づける。WebAuthn userIDは新規登録ではhousehold+personから生成し、既存credentialのバイト列は変更しない。
- HTTPの認証管理ルートを明確に分ける。管理passkey/登録challengeはBearerに加えDB sessionからcontext。認証前credential/challenge/session発行はサーバー内部control-planeとして区別し、通常家計HTTPへBearerだけで入れる根拠にしない。無認証の外部ブラウザにcredential/public key/session発行APIを開放しない。MSWでは同じリクエスト/レスポンス契約を実装。
- TDD: 有効/期限切れ/期限一致/NULL/不明所属session、password成功時だけlegacy解決、credential所属解決、他世帯パスキー管理拒否、別世帯同person登録challengeの独立、異なるブラウザ試行と一回消費、認証前challenge NULL、署名失敗/未知credentialからsession不発行。A/B既存session fixtureで境界を確認するが、新規Bログインは解禁しない。
- 必要な既存認証テスト/FakeD1/MSWを実契約に合わせて更新し、型検査と関連テストを通す。SQL条件が本当に作用する検証は実SQLiteか既存の隔離D1テスト基盤で行う。型だけのブランドをセキュリティ境界とは主張しない。
- 家計経路全体がまだ未対応の中間commit。リリース可能/世帯分離完成とは主張しない。既存APIをoptional household引数で互換化しない。
- 担当のみ日本語Conventional Commit、RED/GREEN/検証/制約をタスクレポートへ。サブエージェントは起動しない。

### Task 4: 明細・集計・月コピーの全経路へ世帯を伝播

所有: `cloudflare/worker/src/records.ts`/`copy-month.ts`、対応するAPIアダプター、明細/集計/コピーActions、これらのHTTPルート・MSW・FakeD1・テスト。Task3の認証contextを利用し、認証契約を緩めない。AI/振込本体と最終migrationは後続。

- 共有D1関数はcontext必須、全SELECT/INSERT/UPDATE/DELETEに認証済み世帯を明示。月一覧/全月集計/フラグ/更新後再取得/コピー内INSERTの内部関数も省略・既定値なし。他世帯IDと不存在は同じ404。
- Action/RSC入口から認証済みcontextをAPIへ渡し、HTTPはセッショントークンで解決したcontextを使用する。body/query/headerの任意householdIdは使わない。認証失敗を正常な空データに変換しない。一般登録は追加しない。
- コピーはsourceMonth+household+選択IDから元データを再取得する。元のラベル/担当/コピー対象金額が確認時と異なる場合409とし、改ざん入力で明細を作らない。labelOnlyは既存どおり金額をコピーしない。不正な選択ID混入は全処理を拒否。replace削除・重複キー判定・繰越生成・先月支出/未清算繰越も世帯内。全書込は既存batch原子性を維持し、コピーに振込履歴を含めない。
- 正負の金額・ソート・CSV/精算計算・コピーmodeの既存仕様を維持する。世帯を変更する更新APIは作らない。
- A/B同月・同担当・同ラベルを持つfixtureで、一覧/集計/全mutation/preview/skip/replace/carryoverの分離とforeign ID拒否・入力改ざん・preview後変更409・batch失敗rollbackを検証。共有Fakeだけでなく実SQLite/D1のSQL実行で条件が作用することを確認する。後段の一意制約変更が必要な同額同キー共存は最終migrationタスクでも再検証する。
- 各API/Actionのテストと型検査を通す。新たなcontext必須signatureの影響でAI/振込の呼出修正が必要な場合、既に認証されたcontextを渡す機械的修正まで行ってよいが、独立した仕様変更はしない。テストが未対応の中間状態を成功扱いしない。
- 担当のみ日本語Conventional Commit、RED/GREENと検証結果をreportへ。サブエージェントは起動しない。

### Task 5: AI診断と振込台帳を世帯単位にする

所有: `cloudflare/worker/src/ai-diagnosis-store.ts`と関連repository、`payment-store.ts`/`payment-status.ts`、対応API/Actions/HTTP/MSW/テストと実D1検証script。Task3/4のcontext契約を維持する。migrationとクライアント状態の最終対応は後続タスク。

- AI repository生成時にcontextを固定し、4か月context・保存済み結果・lease取得・分類保存・結果保存・補償releaseの全経路へ伝播する。SQL中のJOIN/EXISTS/UPDATEの各対象をhouseholdで絞る。保存対象のexpense IDは同じ世帯に存在するものだけ。
- 月leaseは世帯+month、guardとsource revisionは世帯。日次利用回数とcooldownは世帯内で月を跨いで共有。lease期限/実行token/revisionによる既存の排他・stale拒否を保ち、別世帯の変更で拒否しない。古いtokenや別世帯tokenでrelease不可。失敗補償の照会・更新にもhouseholdが必要。
- 振込の月revision/operation再送/明細snapshot/履歴JOIN/訂正・取消/保存batchの全経路をhouseholdで限定。actorは同一認証context由来。外部operation IDが別世帯にある場合は自世帯の新規操作として扱い、同じIDの結果を混同しない。対象paymentのforeign IDは404相当。過去JSONを改変せず、世帯を後付けしない。
- runtime必須context・全SQL条件・HTTPのDB session検証を揃える。AIとpaymentのモックも同じ契約。グローバルfallbackや初回リクエスト時の暗黙legacy行作成は禁止。fixtureで各世帯guard/revisionを明示初期化する。
- TDD: 同月2世帯で診断結果独立、guard/cooldown/日次回数独立、他世帯expense分類拒否、別世帯編集でstaleにならない、自世帯編集でstale、古いtoken補償の無害性。振込は同月同額同operation IDの再送分離、訂正/取消の越境拒否、snapshot漏洩なし、batch途中失敗rollback、revision独立。
- 最終制約のfixtureと実共有関数を使ったSQLite/Miniflare検証を用意し、後続0011/0012の実migration適用後にも再実行可能にする。Fake parserだけを根拠にしない。既存振込整合性テスト・AI競合テストを落とさない。実D1検証はUnitから独立。
- 既存provider呼出や計算式の変更、実OpenAI API呼出、本番接続は行わない。担当のみ日本語Conventional Commit、RED/GREEN/検証/残課題をreportへ。サブエージェントは起動しない。

### Task 6: クライアント状態・表示・再取得の世帯境界

所有: 各RSCページ、monthly-overview、AI/copy/passkey/paymentのクライアント機能、関連UIテスト。サーバーで解決したhouseholdIdをscopeとして渡し、データアクセスの権限は引き続きサーバーで判断する。

- 月・設定画面の世帯依存React keyをhousehold+month等にし、同月の別世帯へ遷移/再ログインしても古いデータ・選択・preview・結果を残さない。開始時scopeと現在scopeが違う非同期応答を無視する。
- 振込pending operationのsessionStorageはhousehold+month。旧 `payment-operation:${month}` を新世帯キーへ移管・自動再送しない。既存世帯の未確認操作はサーバーの当該世帯operation照会/履歴から結果を確認する導線を保つ。
- CSV/集計/グラフ/精算内訳は世帯で限定されたpropsだけを使う。URL・計算・CSV形式・revalidatePathの既存振舞いを維持。永続共有cacheを追加しない。
- コンポーネントテストでA→B同月、遅いA応答、旧pending key、Bでforeign operation照会不可、空データ・境界値を検証。必要なモックを利用し、npm run dev:mockとブラウザでログイン（password）→通常/空/境界表示を確認しscreenshots保存。課金する実AI呼出はしない。
- UI変更は最小限。技術的なhousehold IDや移行用語を通常ユーザーの表示へ出さない。担当のみ日本語Conventional Commit、検証結果をreportへ。サブエージェントは起動しない。

### Task 7: 最終キー切替・制約と全経路の実D1検証

所有: 新規0011_scope_household_data.sql、0012_enforce_household_constraints.sql、backup-schema登録、migration fixture/実D1検証script/SQL越境テスト、CIとcoverage設定。全経路コードが完成してから実施し、第一/第二段階branchへ最終migrationを混入させない。

- migration-design.mdの再構築順を使い、既存0001〜0010を改変しない。0011は全アクセス/認証発行/AI停止下の最終NULL補完とキー/trigger切替。AI3・payment4はNOT NULL/FKまで一度で完成。0012は残る明細3・session・credential・challengeを再構築。authentication challengeのみtype CHECKでNULL許容。
- 既存世帯唯一性・ID/key一致、不明所属/方式/type/越境参照拒否を事前検査。列名指定INSERT SELECTで全保持値を移す。copy中revision triggerを発火させず、旧JSON/id/token/key/counter/利用回数/revision値を保持する。
- FKを無効化しない。子の新FKは新親を参照し、parent→child作成/コピー、child→parent旧表削除、新親→新子rename。defer_foreign_keysが必要なら同一migration内で解決する。依存triggerの削除/再作成と台帳immutableを漏らさない。
- 世帯+月の一意制約、carryoverの世帯付き業務キー、guard/source世帯PK、payment操作の世帯+ID、operation/record/void複合FK、適切な索引を実装。家計行の所属変更を通常SQLでも防ぐ必要を検討し、公開APIに移管を追加しない。
- SQLite/実D1で0008→0009→0010→旧NULL書込→0011→0012の段階検証。各段階の故意失敗rollback、再実行、表集合/全保持列/金額/JSON/trigger/FK検証。同月同額同担当同label/operation IDのA/B fixtureを最終schemaで共存させ、全実共有関数の越境拒否を再実行する。
- backup-schemaに0011/0012を登録し、段階に適合する全表復元検証を確認。実D1検証はUnitから独立。CIはlint/typecheck/unit/build等の独立工程を並列Jobにし、関連schema/script変更とnightlyで実D1検証。通常PR10分目標、15分超は実測で原因を調査する。
- coverageにcloudflare共有ドメイン関数を含める。全体テスト/型/lint/build/実D1/E2Eを一通り確認し、不具合は担当へ戻して修正する。架空世帯を本番や旧Previewから到達可能な共有devへ入れない。
- 0011と対応コードの第三段階branchを残し、0012は第四段階branchへ分離できるcommit単位にする。運用操作や本番接続はせず、担当のみ日本語Conventional Commitとreport。サブエージェントは起動しない。
